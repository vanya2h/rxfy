import type { ServerMessage } from "rxfy-protocol";

/** Opaque connection identifier owned by the transport adapter. */
export type ConnId = number | string;

/** Delivers a message to one connection (registered by the transport). */
export type PublishSink = (conn: ConnId, message: ServerMessage) => void;

/**
 * Pure pub/sub over opaque routing ids (the hashed topic keys from the keyer).
 * Holds NO counters — the "updates available" tally is purely client-side.
 */
export type Hub = {
  publish: (id: string, message: ServerMessage) => void;
  subscribe: (conn: ConnId, ids: string[]) => void;
  unsubscribe: (conn: ConnId, ids: string[]) => void;
  drop: (conn: ConnId) => void;
  onPublish: (sink: PublishSink) => void;
};

export function createInMemoryHub(): Hub {
  const subscribers = new Map<string, Set<ConnId>>(); // id -> conns
  const connIds = new Map<ConnId, Set<string>>(); // conn -> ids (for drop)
  let sink: PublishSink | undefined;

  const forget = (conn: ConnId, id: string): void => {
    const conns = subscribers.get(id);
    if (!conns) return;
    conns.delete(conn);
    if (conns.size === 0) subscribers.delete(id);
  };

  return {
    publish(id, message) {
      const conns = subscribers.get(id);
      if (!conns || !sink) return;
      for (const conn of conns) sink(conn, message);
    },
    subscribe(conn, ids) {
      for (const id of ids) {
        let conns = subscribers.get(id);
        if (!conns) subscribers.set(id, (conns = new Set()));
        conns.add(conn);
        let owned = connIds.get(conn);
        if (!owned) connIds.set(conn, (owned = new Set()));
        owned.add(id);
      }
    },
    unsubscribe(conn, ids) {
      for (const id of ids) {
        forget(conn, id);
        connIds.get(conn)?.delete(id);
      }
    },
    drop(conn) {
      const owned = connIds.get(conn);
      if (owned) for (const id of owned) forget(conn, id);
      connIds.delete(conn);
    },
    onPublish(next) {
      sink = next;
    },
  };
}
