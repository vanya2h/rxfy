import type { ServerMessage } from "rxfy-protocol";

/** A browser session id — minted by the server for SSR loads, or by the client for CSR-only loads. */
export type SessionId = string;

/** Delivers a message to one session's socket (registered by the transport). */
export type PublishSink = (session: SessionId, message: ServerMessage) => void;

/** Hub subscription id for an entity topic. The `e:`/`c:` prefixes keep entity and channel namespaces disjoint. */
export const entitySubscription = (name: string, id: string): string => `e:${name}:${id}`;
/** Hub subscription id for a state invalidation channel. */
export const channelSubscription = (channel: string): string => `c:${channel}`;

export type HubOptions = {
  /** How long an unbound session's subscriptions survive (never-connected SSR sessions, closed tabs). */
  ttlMs?: number;
  /** Injectable clock (defaults to Date.now); used for deterministic tests. */
  now?: () => number;
};

/**
 * Pub/sub over subscription ids, keyed by session. Subscriptions are written by the SERVE path
 * (rxfy-server's serve/hydration), never by client frames; the WS layer only binds/releases
 * sockets. Holds NO counters — the "updates available" tally is purely client-side.
 */
export type Hub = {
  publish: (id: string, message: ServerMessage) => void;
  subscribe: (session: SessionId, ids: string[]) => void;
  unsubscribe: (session: SessionId, ids: string[]) => void;
  /** Socket liveness from the transport. Bound sessions never expire; release starts the TTL clock. */
  bind: (session: SessionId) => void;
  release: (session: SessionId) => void;
  drop: (session: SessionId) => void;
  onPublish: (sink: PublishSink) => void;
};

const DEFAULT_TTL_MS = 5 * 60_000;

export function createInMemoryHub(options: HubOptions = {}): Hub {
  const { ttlMs = DEFAULT_TTL_MS, now = Date.now } = options;
  type Session = { ids: Set<string>; bound: boolean; expiresAt: number };
  const subscribers = new Map<string, Set<SessionId>>(); // id -> sessions
  const sessions = new Map<SessionId, Session>();
  let sink: PublishSink | undefined;

  const forget = (session: SessionId, id: string): void => {
    const holders = subscribers.get(id);
    if (!holders) return;
    holders.delete(session);
    if (holders.size === 0) subscribers.delete(id);
  };

  const drop = (session: SessionId): void => {
    const entry = sessions.get(session);
    if (entry) for (const id of entry.ids) forget(session, id);
    sessions.delete(session);
  };

  /** Evict unbound sessions whose TTL elapsed — called lazily from publish/subscribe/bind. */
  const sweep = (): void => {
    const t = now();
    for (const [session, entry] of sessions) {
      if (!entry.bound && entry.expiresAt <= t) drop(session);
    }
  };

  const ensure = (session: SessionId): Session => {
    let entry = sessions.get(session);
    if (!entry) sessions.set(session, (entry = { ids: new Set(), bound: false, expiresAt: now() + ttlMs }));
    return entry;
  };

  return {
    publish(id, message) {
      sweep();
      const holders = subscribers.get(id);
      if (!holders || !sink) return;
      for (const session of holders) sink(session, message);
    },
    subscribe(session, ids) {
      sweep();
      const entry = ensure(session);
      if (!entry.bound) entry.expiresAt = now() + ttlMs; // fresh activity restarts the clock
      for (const id of ids) {
        let holders = subscribers.get(id);
        if (!holders) subscribers.set(id, (holders = new Set()));
        holders.add(session);
        entry.ids.add(id);
      }
    },
    unsubscribe(session, ids) {
      const entry = sessions.get(session);
      if (!entry) return;
      for (const id of ids) {
        forget(session, id);
        entry.ids.delete(id);
      }
    },
    bind(session) {
      sweep();
      const entry = ensure(session);
      entry.bound = true;
    },
    release(session) {
      const entry = sessions.get(session);
      if (!entry) return;
      entry.bound = false;
      entry.expiresAt = now() + ttlMs;
    },
    drop,
    onPublish(next) {
      sink = next;
    },
  };
}
