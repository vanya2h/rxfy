/* eslint-disable turbo/no-undeclared-env-vars */
import { createServer } from "node:http";
import next from "next";
import { createWsServer } from "rxfy-ws";
import { WebSocketServer } from "ws";
import { hub } from "./src/server/live";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

// A custom server, because plain `next dev`/`next start` cannot host a WebSocket endpoint —
// and the live layer pushes patch/stale messages over one.
const app = next({ dev });
await app.prepare();
const handle = app.getRequestHandler();
const handleUpgrade = app.getUpgradeHandler();

const wsServer = createWsServer(hub);
const wss = new WebSocketServer({ noServer: true });

const server = createServer((req, res) => void handle(req, res));
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/live") {
    // A `ws` socket satisfies rxfy-ws's structural ServerSocket directly.
    wss.handleUpgrade(req, socket, head, (ws) => wsServer.handleConnection(ws));
  } else {
    // Everything else (Next's dev HMR socket) goes to Next.
    void handleUpgrade(req, socket, head);
  }
});

server.listen(port, () => console.log(`Live blog (Next.js) at http://localhost:${port}`));
