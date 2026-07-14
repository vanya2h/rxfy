import type { ServerMessage } from "rxfy-protocol";

/** A WebSocket connection id, assigned by the WS layer. Subscription state lives and dies with the socket. */
export type ConnId = number;

export type PublishSink = (conn: ConnId, message: ServerMessage) => void;

/** Hub subscription id for an entity topic. The `e:`/`c:` prefixes keep entity and channel namespaces disjoint. */
export const entitySubscription = (name: string, id: string): string => `e:${name}:${id}`;
/** Hub subscription id for a pre-joined `name:id` entity topic (as carried in a `subscribe` frame). */
export const entityTopicSubscription = (topic: string): string => `e:${topic}`;
/** Hub subscription id for a state invalidation channel. */
export const channelSubscription = (channel: string): string => `c:${channel}`;

export type HubOptions = {
  /** Injectable clock (defaults to Date.now); used for deterministic tests. */
  now?: () => number;
};

/**
 * Pub/sub over subscription ids, keyed by connection. Subscriptions are written by the WS layer
 * from verified `subscribe` frames and expire with their grant; a closed socket drops everything —
 * the client owns durability by replaying its grants on reconnect.
 */
export type Hub = {
  publish: (id: string, message: ServerMessage) => void;
  /** Register ids for a connection, expiring at `exp` (epoch ms). Re-subscribing extends in place. */
  subscribe: (conn: ConnId, ids: string[], exp: number) => void;
  drop: (conn: ConnId) => void;
  onPublish: (sink: PublishSink) => void;
};

export function createInMemoryHub(options: HubOptions = {}): Hub {
  const { now = Date.now } = options;
  const subscribers = new Map<string, Set<ConnId>>(); // id -> conns
  const conns = new Map<ConnId, Map<string, number>>(); // conn -> id -> exp
  let sink: PublishSink | undefined;

  const forget = (conn: ConnId, id: string): void => {
    const holders = subscribers.get(id);
    if (!holders) return;
    holders.delete(conn);
    if (holders.size === 0) subscribers.delete(id);
  };

  return {
    publish(id, message) {
      const holders = subscribers.get(id);
      if (!holders || !sink) return;
      const t = now();
      for (const conn of [...holders]) {
        const exp = conns.get(conn)?.get(id);
        if (exp === undefined || exp <= t) {
          // lazily prune the expired entry; unpublished expired ids linger until the socket closes
          forget(conn, id);
          conns.get(conn)?.delete(id);
          continue;
        }
        sink(conn, message);
      }
    },
    subscribe(conn, ids, exp) {
      let entry = conns.get(conn);
      if (!entry) conns.set(conn, (entry = new Map()));
      for (const id of ids) {
        let holders = subscribers.get(id);
        if (!holders) subscribers.set(id, (holders = new Set()));
        holders.add(conn);
        entry.set(id, Math.max(entry.get(id) ?? 0, exp));
      }
    },
    drop(conn) {
      const entry = conns.get(conn);
      if (entry) for (const id of entry.keys()) forget(conn, id);
      conns.delete(conn);
    },
    onPublish(next) {
      sink = next;
    },
  };
}
