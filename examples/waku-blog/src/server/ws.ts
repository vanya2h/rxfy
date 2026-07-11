import { createWsServer } from "rxfy-ws";
import { WebSocketServer } from "ws";
import { hub } from "./live";

/** The live socket's own port — waku owns its HTTP server, so the WebSocket gets a sibling one. */
// eslint-disable-next-line turbo/no-undeclared-env-vars
export const WS_PORT = Number(process.env.RXFY_WS_PORT) || 8090;

const globalForWs = globalThis as unknown as { __wakuBlogWs?: WebSocketServer };

/**
 * Start the live WebSocket server once per process (guarded through globalThis, since waku's dev
 * server may evaluate this module in more than one bundle). Called from the api middleware, which
 * waku loads at startup.
 */
export function startLiveSocket(): void {
  if (globalForWs.__wakuBlogWs) return;
  const wsServer = createWsServer(hub);
  const wss = new WebSocketServer({ port: WS_PORT });
  // A `ws` socket satisfies rxfy-ws's structural ServerSocket directly.
  wss.on("connection", (socket) => wsServer.handleConnection(socket));
  globalForWs.__wakuBlogWs = wss;
  console.log(`Live socket at ws://localhost:${WS_PORT}`);
}
