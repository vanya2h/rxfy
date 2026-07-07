import { parseClientMessage, serialize } from "rxfy-protocol";
import type { ConnId, Hub } from "rxfy-server";

/** The minimal socket shape the adapter needs (satisfied structurally by a `ws` WebSocket). */
export type ServerSocket = {
  send: (data: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

/** Bridges a `Hub` to WebSocket connections. Register the sink once; call `handleConnection` per socket. */
export function createWsServer(hub: Hub): { handleConnection: (socket: ServerSocket) => void } {
  const sockets = new Map<ConnId, ServerSocket>();
  hub.onPublish((conn, message) => {
    sockets.get(conn)?.send(serialize(message));
  });

  let nextConnId = 0;
  return {
    handleConnection(socket) {
      const connId: ConnId = nextConnId++;
      sockets.set(connId, socket);

      socket.on("message", (data: unknown) => {
        const text = typeof data === "string" ? data : (data as { toString(): string }).toString();
        let frame;
        try {
          frame = parseClientMessage(text);
        } catch {
          return;
        }
        if (frame.kind === "subscribe") hub.subscribe(connId, frame.ids);
        else hub.unsubscribe(connId, frame.ids);
      });

      socket.on("close", () => {
        hub.drop(connId);
        sockets.delete(connId);
      });
    },
  };
}
