import { createServer as createHttpServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import type { ViteDevServer } from "vite";
import { api } from "./api.js";
import { initDb } from "./db.js";
import { renderPage } from "./render.js";
import { liveRoute } from "./ws.js";

const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 3000);

await initDb();

const app = new Hono();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

app.route("/api", api);
app.get("/live", liveRoute(upgradeWebSocket));

let vite: ViteDevServer | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
} else {
  app.use("/assets/*", serveStatic({ root: "./dist/client" }));
}

app.get("*", async (c) => {
  try {
    return c.html(await renderPage(c.req.path, vite, isProduction));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    vite?.ssrFixStacktrace(err);
    console.error(err.stack);
    return c.text(err.stack ?? String(err), 500);
  }
});

const honoListener = getRequestListener(app.fetch);
const server = createHttpServer((req, res) => {
  if (vite) vite.middlewares(req, res, () => honoListener(req, res));
  else honoListener(req, res);
});
injectWebSocket(server);
server.listen(port, () => console.log(`rxfy live todos at http://localhost:${port}`));
