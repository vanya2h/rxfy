import type { IModelRegistry } from "rxfy";
import { type ClientMessage, type ServerMessage, subscribe as subscribeFrame } from "rxfy-protocol";
import { BehaviorSubject, type Observable } from "rxjs";
import { readSsrGrants } from "./read-grants.js";

/** Structural transport (satisfied by rxfy-ws/client's ClientTransport). */
export type SyncTransport = {
  send: (message: ClientMessage) => void;
  onMessage: (handler: (message: ServerMessage) => void) => void;
  onOpen: (handler: () => void) => void;
};

export type ChannelCounter = {
  available$: Observable<number>;
  reset: () => void;
};

export type SyncClient = {
  /** Record a grant; sends the subscribe frame and replays it on reconnect and after renewal. */
  subscribe: (grant: string) => void;
  channel: (channel: string) => ChannelCounter;
  stop: () => void;
};

export type SyncClientConfig = {
  registry: IModelRegistry;
  transport: SyncTransport;
  /** Renewal endpoint (POST { grants: string[] } -> { grants: (string | null)[] }). Omit to let grants expire. */
  renewUrl?: string;
  /** Renew this long before the soonest expiry. */
  renewLeadMs?: number;
  now?: () => number;
};

/**
 * Decode a grant's payload without verifying — the client only needs ch/exp for bookkeeping.
 * Server grants are base64url; normalize to base64 before `atob` (which only accepts base64).
 */
const decodeGrant = (token: string): { ch: string; exp: number } | null => {
  try {
    const part = (token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(part)) as { ch?: unknown; exp?: unknown };
    return typeof payload.ch === "string" && typeof payload.exp === "number"
      ? { ch: payload.ch, exp: payload.exp }
      : null;
  } catch {
    return null;
  }
};

/**
 * Grant custody: the client keeps a `channel -> { grant, exp, entities }` map. Each entry's
 * subscribe frame is (re)sent on subscribe, on reconnect (`onOpen`), and after renewal. A single
 * timer renews grants nearing expiry against `renewUrl`; a denied renewal drops the entry. Patches
 * land in the model stores in place; stales bump the matching channel counter.
 */
export function createSyncClient(config: SyncClientConfig): SyncClient {
  const { registry, transport, renewLeadMs = 60_000, now = Date.now } = config;
  const counters = new Map<string, BehaviorSubject<number>>();
  const entries = new Map<string, { grant: string; exp: number }>(); // by channel
  let renewTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const sendEntry = (entry: { grant: string }): void => transport.send(subscribeFrame(entry.grant));

  const scheduleRenewal = (): void => {
    if (renewTimer) clearTimeout(renewTimer);
    if (!config.renewUrl || entries.size === 0 || stopped) return;
    const soonest = Math.min(...[...entries.values()].map((e) => e.exp));
    renewTimer = setTimeout(renew, Math.max(0, soonest - renewLeadMs - now()));
  };

  const renew = async (): Promise<void> => {
    const stale = [...entries.values()].filter((e) => e.exp - renewLeadMs <= now());
    if (stale.length === 0) return scheduleRenewal();
    try {
      const res = await fetch(config.renewUrl!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grants: stale.map((e) => e.grant) }),
      });
      const { grants } = (await res.json()) as { grants: (string | null)[] };
      grants.forEach((fresh, i) => {
        const old = stale[i];
        if (!old) return;
        const claims = fresh === null ? null : decodeGrant(fresh);
        if (fresh === null || claims === null) {
          entries.delete(decodeGrant(old.grant)?.ch ?? old.grant); // denied — updates for this channel end
          return;
        }
        const entry = { grant: fresh, exp: claims.exp };
        entries.set(claims.ch, entry);
        sendEntry(entry);
      });
    } catch {
      // network failure: the grant is already past its lead window, so a plain reschedule would
      // fire at delay 0 and hammer renewUrl every tick. Back off by the lead window and retry.
      if (!stopped && config.renewUrl && entries.size > 0) {
        if (renewTimer) clearTimeout(renewTimer);
        renewTimer = setTimeout(renew, renewLeadMs);
      }
      return;
    }
    scheduleRenewal();
  };

  transport.onMessage((message) => {
    switch (message.kind) {
      case "patch": {
        const data = message.data as Record<string, unknown>;
        const descriptor = registry.descriptor(message.name);
        if (descriptor) {
          for (const [field, meta] of Object.entries(descriptor.relations)) {
            // Mirror the relation id from its FK column so a flat patch keeps the relation resolvable.
            if (meta.fk && meta.fk in data) data[field] = data[meta.fk];
          }
        }
        registry.namedStores().get(message.name)?.set(message.id, data);
        break;
      }
      case "stale": {
        const counter = counters.get(message.channel);
        if (counter) counter.next(counter.value + 1);
        break;
      }
    }
  });

  transport.onOpen(() => {
    for (const entry of entries.values()) sendEntry(entry);
  });

  const client: SyncClient = {
    subscribe(grant) {
      const claims = decodeGrant(grant);
      if (claims === null) return;
      const entry = { grant, exp: claims.exp };
      entries.set(claims.ch, entry);
      sendEntry(entry);
      scheduleRenewal();
    },
    channel(channel) {
      let counter = counters.get(channel);
      if (!counter) counters.set(channel, (counter = new BehaviorSubject(0)));
      const subject = counter;
      return { available$: subject.asObservable(), reset: () => subject.next(0) };
    },
    stop() {
      stopped = true;
      if (renewTimer) clearTimeout(renewTimer);
      for (const counter of counters.values()) counter.complete();
      counters.clear();
      entries.clear();
    },
  };

  // SSR intake: each grant self-describes its entities, so just resubscribe them all.
  for (const grant of readSsrGrants()) client.subscribe(grant);

  return client;
}
