/* eslint-disable turbo/no-undeclared-env-vars */
import fs from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { ViteDevServer } from "vite";
import { db, seed, todos } from "./db.ts";
import { addClient, addDeps, publish, removeClient, removeDeps } from "./hub.ts";

const isProduction = process.env.NODE_ENV === "production";
const port = 5175;

seed();

const app = new Hono();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

// --- REST API ---
app.get("/api/todos", (c) => {
  return c.json({ todos: db.select().from(todos).all() });
});

app.post("/api/todos", async (c) => {
  const { title } = (await c.req.json()) as { title: string };
  const todo = { id: crypto.randomUUID(), title, done: false };
  db.insert(todos).values(todo).run();
  return c.json(todo);
});

app.post("/api/todos/:id/toggle", (c) => {
  const id = c.req.param("id");
  const row = db.select().from(todos).where(eq(todos.id, id)).get();
  if (!row) return c.json({ error: "not found" }, 404);
  const updated = { ...row, done: !row.done };
  db.update(todos).set({ done: updated.done }).where(eq(todos.id, id)).run();
  publish("todo", id, updated); // targeted live update
  return c.json(updated);
});

app.patch("/api/todos/:id", async (c) => {
  const id = c.req.param("id");
  const { title } = (await c.req.json()) as { title: string };
  const row = db.select().from(todos).where(eq(todos.id, id)).get();
  if (!row) return c.json({ error: "not found" }, 404);
  const updated = { ...row, title };
  db.update(todos).set({ title }).where(eq(todos.id, id)).run();
  publish("todo", id, updated); // targeted live update
  return c.json(updated);
});

app.delete("/api/todos/:id", (c) => {
  const id = c.req.param("id");
  db.delete(todos).where(eq(todos.id, id)).run();
  return c.json({ ok: true });
});

// --- WebSocket: maintain this connection's dependency set ---
app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen: (_evt, ws) => addClient(ws),
    onMessage: (evt, ws) => {
      const msg = JSON.parse(evt.data.toString()) as { type: string; topics: string[] };
      if (msg.type === "add") addDeps(ws, msg.topics);
      else if (msg.type === "remove") removeDeps(ws, msg.topics);
    },
    onClose: (_evt, ws) => removeClient(ws),
  })),
);

// --- Vite (dev) / static (prod) ---
let vite: ViteDevServer | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
} else {
  app.use("/assets/*", serveStatic({ root: "./dist/client" }));
}

// --- SSR catch-all ---
app.get("*", async (c) => {
  const url = c.req.path;
  try {
    let template: string;
    let render: (url: string) => Promise<{ html: string; state: string }>;
    if (!isProduction) {
      template = await fs.readFile("./index.html", "utf-8");
      template = await vite!.transformIndexHtml(url, template);
      render = (await vite!.ssrLoadModule("/src/entry-server.tsx")).render;
    } else {
      template = await fs.readFile("./dist/client/index.html", "utf-8");
      // @ts-expect-error — built artifact has no .d.ts
      render = (await import("./dist/server/entry-server.js")).render;
    }
    const rendered = await render(url);
    const html = template.replace("<!--app-html-->", rendered.html).replace("<!--app-state-->", rendered.state);
    return c.html(html);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    vite?.ssrFixStacktrace(err);
    console.error(err.stack);
    return c.text(err.stack ?? String(err), 500);
  }
});

// Own the Node server so @hono/node-ws can attach the upgrade handler.
// In dev, Vite middlewares run first (assets/HMR), then Hono handles the rest.
const honoListener = getRequestListener(app.fetch);
const server = createHttpServer((req, res) => {
  if (vite) vite.middlewares(req, res, () => honoListener(req, res));
  else honoListener(req, res);
});
injectWebSocket(server);
server.listen(port, () => console.log(`Server started at http://localhost:${port}`));
