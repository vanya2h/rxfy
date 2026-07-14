import { createServer } from "node:http";
import next from "next";
import { createWsServer } from "rxfy-ws";
import { WebSocketServer } from "ws";
import { initDb } from "./src/server/db";
import { hub, SECRET } from "./src/server/sync";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

// Seed the DB before handling requests (RSC reads and route handlers both hit it).
await initDb();

// A custom server, because plain `next start` cannot host a WebSocket endpoint — the live layer
// pushes patch/stale messages over one.
const app = next({ dev });
await app.prepare();
const handle = app.getRequestHandler();
const handleUpgrade = app.getUpgradeHandler();

// Share the grant-signing secret with the HTTP side so grants signed by serve() verify here.
const wsServer = createWsServer(hub, { secret: SECRET });
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

server.listen(port, () => console.log(`rxfy live todos (Next.js) at http://localhost:${port}`));
