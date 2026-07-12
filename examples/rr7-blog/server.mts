/* eslint-disable turbo/no-undeclared-env-vars */
import { createServer as createHttpServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createRequestHandler, type ServerBuild } from "react-router";
import { createWsServer } from "rxfy-ws";
import type { ViteDevServer } from "vite";
import { WebSocketServer } from "ws";
import { hub, SECRET } from "./app/server/live";

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 5173;

// A custom server, because `react-router-serve` cannot host a WebSocket endpoint — and the live
// layer pushes patch/stale messages over one.
const app = new Hono();

let vite: ViteDevServer | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true } });
} else {
  app.use("/assets/*", serveStatic({ root: "./build/client" }));
  app.use("/favicon.ico", serveStatic({ root: "./build/client" }));
}

const loadBuild = async (): Promise<ServerBuild> =>
  vite
    ? ((await vite.ssrLoadModule("virtual:react-router/server-build")) as ServerBuild)
    : // @ts-expect-error — build artifact has no .d.ts
      ((await import("./build/server/index.js")) as ServerBuild);

app.all("*", async (c) => {
  const handler = createRequestHandler(await loadBuild(), isProduction ? "production" : "development");
  return handler(c.req.raw);
});

// Same SECRET as the HTTP server so grants signed by serve()/hydration() verify on subscribe.
const wsServer = createWsServer(hub, { secret: SECRET });
const wss = new WebSocketServer({ noServer: true });

const honoListener = getRequestListener(app.fetch);
const server = createHttpServer((req, res) => {
  if (vite) vite.middlewares(req, res, () => honoListener(req, res));
  else honoListener(req, res);
});
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/live") {
    // A `ws` socket satisfies rxfy-ws's structural ServerSocket directly.
    wss.handleUpgrade(req, socket, head, (ws) => wsServer.handleConnection(ws));
  } else {
    socket.destroy(); // vite's dev HMR websocket runs on its own port in middleware mode
  }
});

server.listen(port, () => console.log(`Live blog (React Router) at http://localhost:${port}`));
