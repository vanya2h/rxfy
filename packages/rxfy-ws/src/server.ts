import { parseClientMessage, serialize } from "rxfy-protocol";
import { channelSubscription, type ConnId, entityTopicSubscription, type Hub, verifyGrant } from "rxfy-server/hub";

/** The minimal socket shape the adapter needs (satisfied structurally by a `ws` WebSocket). */
export type ServerSocket = {
  send: (data: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type WsServerOptions = { secret: string };

/**
 * Bridges a Hub to WebSocket connections. Clients present a signed channel grant in each `subscribe`
 * frame; the grant's claims name the channel AND the exact entity topics it authorizes, so the
 * server subscribes to those alone — nothing the client asks for out of band. Invalid frames are
 * dropped silently: the client's renewal/refetch loop is the recovery path. A closed socket drops
 * all of its subscriptions.
 */
export function createWsServer(
  hub: Hub,
  options: WsServerOptions,
): { handleConnection: (socket: ServerSocket) => void } {
  const sockets = new Map<ConnId, ServerSocket>();
  let nextConn: ConnId = 0;
  hub.onPublish((conn, message) => {
    sockets.get(conn)?.send(serialize(message));
  });

  return {
    handleConnection(socket) {
      const conn = nextConn++;
      sockets.set(conn, socket);

      socket.on("message", (data: unknown) => {
        const text = typeof data === "string" ? data : (data as { toString(): string }).toString();
        let frame;
        try {
          frame = parseClientMessage(text);
        } catch {
          return;
        }
        const claims = verifyGrant(frame.grant, { secret: options.secret });
        if (claims === null) return;
        const ids = [channelSubscription(claims.channel), ...claims.entities.map(entityTopicSubscription)];
        hub.subscribe(conn, ids, claims.exp);
      });

      socket.on("close", () => {
        sockets.delete(conn);
        hub.drop(conn);
      });
    },
  };
}
