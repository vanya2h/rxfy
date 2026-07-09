import { randomUUID } from "node:crypto";
import { parseClientMessage, serialize, session as sessionFrame } from "rxfy-protocol";
import type { Hub, SessionId } from "rxfy-server";

/** The minimal socket shape the adapter needs (satisfied structurally by a `ws` WebSocket). */
export type ServerSocket = {
  send: (data: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

/**
 * Bridges a Hub to WebSocket connections. Clients identify with a `hello` frame; the hub routes
 * pushes by session. Subscriptions are written server-side by the serve path — no subscribe frames.
 */
export function createWsServer(hub: Hub): { handleConnection: (socket: ServerSocket) => void } {
  const sockets = new Map<SessionId, ServerSocket>();
  hub.onPublish((session, message) => {
    sockets.get(session)?.send(serialize(message));
  });

  return {
    handleConnection(socket) {
      let session: SessionId | undefined;

      socket.on("message", (data: unknown) => {
        const text = typeof data === "string" ? data : (data as { toString(): string }).toString();
        let frame;
        try {
          frame = parseClientMessage(text);
        } catch {
          return;
        }
        // hello is the only client frame: bind this socket as the session's delivery target.
        // A session-less hello is a client-only app asking the server to mint one.
        const assigned = frame.session === undefined;
        session = frame.session ?? randomUUID();
        sockets.set(session, socket);
        hub.bind(session);
        if (assigned) socket.send(serialize(sessionFrame(session)));
      });

      socket.on("close", () => {
        if (!session) return;
        // A reconnect may already have replaced this socket; only the current holder releases.
        if (sockets.get(session) === socket) {
          sockets.delete(session);
          hub.release(session);
        }
      });
    },
  };
}
