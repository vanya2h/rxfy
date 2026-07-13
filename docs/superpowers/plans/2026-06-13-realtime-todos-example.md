# Realtime Todos Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `examples/vite-realtime-todos` — a Vite SSR + Hono + Drizzle (SQLite) app that demonstrates rxfy's normalized entities updating live over a WebSocket using the per-connection dependency-hub design.

**Architecture:** One Hono Node server on one port (5175) does SSR + REST API + WebSocket. Vite runs in middleware mode inside that server (bridged via `@hono/node-server`'s `getRequestListener`); `@hono/node-ws` owns the `http.Server` upgrade for the `/ws` route. The server keeps one topic-set per connection (`Map<WSContext, Set<string>>`) and pushes an entity only to connections that fetched it. The client opens the socket, subscribes to the ids its query fetched, and applies pushes with `store.setMany`.

**Tech Stack:** Vite 6 (SSR, React 19), Hono + `@hono/node-server` + `@hono/node-ws`, Drizzle ORM + `better-sqlite3`, rxfy / rxfy-react (`workspace:*`), zod, TypeScript.

**Note on testing:** The repo's examples ship no unit tests; verification here is `check-types`, `lint`, booting the server, `curl` against the API, and a two-tab manual check. Steps reflect that instead of red/green unit cycles.

**Spec:** `docs/superpowers/specs/2026-06-13-realtime-todos-example-design.md`

**Working directory for all paths below:** `examples/vite-realtime-todos/`

**Fixed constants:** dev/prod port `5175`; model name `"todo"`; topic format `"todo:<id>"`; WS path `/ws`; API prefix `/api`.

---

### Task 1: Scaffold the package

**Files:**

- Create: `examples/vite-realtime-todos/package.json`
- Create: `examples/vite-realtime-todos/.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "rxfy-example-realtime-todos",
  "version": "0.1.0",
  "private": true,
  "description": "example realtime todos app (Vite SSR + Hono + Drizzle + WebSockets)",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "check-types": "tsc -b --noEmit",
    "clean": "rimraf ./dist",
    "dev": "tsx ./server/index.ts",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build --outDir dist/client",
    "build:server": "vite build --ssr src/entry-server.tsx --outDir dist/server",
    "preview": "cross-env NODE_ENV=production tsx ./server/index.ts",
    "lint": "eslint ."
  },
  "devDependencies": {
    "@hono/node-server": "^1.14.0",
    "@hono/node-ws": "^1.1.0",
    "@types/better-sqlite3": "^7.6.11",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vanya2h/eslint-config": "^0.7.0",
    "@vitejs/plugin-react": "^5.2.0",
    "better-sqlite3": "^11.8.0",
    "cross-env": "^7.0.3",
    "drizzle-orm": "^0.38.0",
    "eslint": "^9.27.0",
    "hono": "^4.7.0",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "rimraf": "^6.0.1",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxjs": "^7.8.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "zod": "^3.25.42"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
dist
.turbo
node_modules
*.tsbuildinfo
```

- [ ] **Step 3: Install dependencies from repo root**

Run: `cd /Users/ivankoryakovtsev/Work/rxfy && pnpm install`
Expected: install succeeds; `better-sqlite3` native build completes; `examples/vite-realtime-todos/node_modules` is populated. If `better-sqlite3` fails to build, it needs a compiler toolchain — note the failure and stop.

- [ ] **Step 4: Commit**

```bash
git add examples/vite-realtime-todos/package.json examples/vite-realtime-todos/.gitignore pnpm-lock.yaml
git commit -m "chore(example): scaffold realtime-todos package"
```

---

### Task 2: TypeScript + lint + Vite config

**Files:**

- Create: `examples/vite-realtime-todos/tsconfig.json`
- Create: `examples/vite-realtime-todos/tsconfig.app.json`
- Create: `examples/vite-realtime-todos/tsconfig.node.json`
- Create: `examples/vite-realtime-todos/eslint.config.ts`
- Create: `examples/vite-realtime-todos/vite.config.ts`
- Create: `examples/vite-realtime-todos/src/vite-env.d.ts`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Create `tsconfig.app.json`** (client + shared)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["src", "shared"]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`** (server + tooling)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "types": ["node"]
  },
  "include": ["server", "shared", "vite.config.ts", "eslint.config.ts"]
}
```

- [ ] **Step 4: Create `eslint.config.ts`**

```ts
import { config } from "@vanya2h/eslint-config/react";
import { Linter } from "eslint";

export default [
  ...config,
  {
    ignores: ["dist/**", ".turbo/**", "node_modules/**"],
  },
] satisfies Linter.Config[];
```

- [ ] **Step 5: Create `vite.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 6: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 7: Commit**

```bash
git add examples/vite-realtime-todos/tsconfig*.json examples/vite-realtime-todos/eslint.config.ts examples/vite-realtime-todos/vite.config.ts examples/vite-realtime-todos/src/vite-env.d.ts
git commit -m "chore(example): add tsconfig, eslint, vite config"
```

---

### Task 3: Shared schema

**Files:**

- Create: `examples/vite-realtime-todos/shared/todo.ts`

- [ ] **Step 1: Create `shared/todo.ts`**

```ts
import { z } from "zod";

export const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export type Todo = z.infer<typeof TodoSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add examples/vite-realtime-todos/shared/todo.ts
git commit -m "feat(example): shared todo schema"
```

---

### Task 4: Server database (Drizzle + SQLite)

**Files:**

- Create: `examples/vite-realtime-todos/server/db.ts`

- [ ] **Step 1: Create `server/db.ts`**

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const todos = sqliteTable("todos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
});

const sqlite = new Database(":memory:");
sqlite.exec(
  `CREATE TABLE IF NOT EXISTS todos (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     done INTEGER NOT NULL DEFAULT 0
   );`,
);

export const db = drizzle(sqlite);

// In-memory DB resets every boot — seed a few rows so the page has content.
export function seed() {
  if (db.select().from(todos).all().length > 0) return;
  db.insert(todos)
    .values([
      { id: "1", title: "Buy groceries", done: false },
      { id: "2", title: "Walk the dog", done: true },
      { id: "3", title: "Read a book", done: false },
    ])
    .run();
}
```

- [ ] **Step 2: Commit**

```bash
git add examples/vite-realtime-todos/server/db.ts
git commit -m "feat(example): drizzle sqlite schema and seed"
```

---

### Task 5: Dependency hub

**Files:**

- Create: `examples/vite-realtime-todos/server/hub.ts`

- [ ] **Step 1: Create `server/hub.ts`**

```ts
import type { WSContext } from "hono/ws";

// One set of dependency topics per connection — the entire subscription state.
// topic = `${model.name}:${id}`, e.g. "todo:1".
const deps = new Map<WSContext, Set<string>>();

export function addClient(ws: WSContext) {
  deps.set(ws, new Set());
}

export function removeClient(ws: WSContext) {
  deps.delete(ws);
}

export function addDeps(ws: WSContext, topics: string[]) {
  const set = deps.get(ws);
  if (set) for (const topic of topics) set.add(topic);
}

export function removeDeps(ws: WSContext, topics: string[]) {
  const set = deps.get(ws);
  if (set) for (const topic of topics) set.delete(topic);
}

// Push one entity to the connections whose dependency set includes it. O(connections).
export function publish(name: string, id: string, entity: unknown) {
  const topic = `${name}:${id}`;
  const message = JSON.stringify({ name, entities: [entity] });
  for (const [ws, set] of deps) {
    if (set.has(topic)) ws.send(message);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add examples/vite-realtime-todos/server/hub.ts
git commit -m "feat(example): per-connection dependency hub"
```

---

### Task 6: Server entrypoint (SSR + API + WS)

**Files:**

- Create: `examples/vite-realtime-todos/server/index.ts`

- [ ] **Step 1: Create `server/index.ts`**

```ts
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
```

- [ ] **Step 2: Type-check the server in isolation**

Run: `cd examples/vite-realtime-todos && pnpm exec tsc -p tsconfig.node.json`
Expected: no errors. (Client files don't exist yet; this checks only `server/` + `shared/`.) If `getRequestListener` or `serveStatic` are reported missing, confirm the installed `@hono/node-server` version exports them (`pnpm why @hono/node-server`) and adjust the import.

- [ ] **Step 3: Commit**

```bash
git add examples/vite-realtime-todos/server/index.ts
git commit -m "feat(example): hono server with SSR, REST API, and websocket"
```

---

### Task 7: Client models

**Files:**

- Create: `examples/vite-realtime-todos/src/models.ts`

- [ ] **Step 1: Create `src/models.ts`**

```ts
import { array, createModel, defineState } from "rxfy";
import { useModelStore } from "rxfy-react";
import { z } from "zod";
import { TodoSchema, type Todo } from "../shared/todo.ts";

export type { Todo };

export const todoModel = createModel(TodoSchema, { getKey: (t) => t.id, name: "todo" });
export const useTodoStore = () => useModelStore(todoModel);

export const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
    removeTodo: (prev, id: string) => ({ ...prev, todos: prev.todos.filter((t) => t.id !== id) }),
  },
});

// On the server (SSR) fetch must be absolute; on the client a relative path is fine.
const API_BASE = import.meta.env.SSR ? "http://localhost:5175" : "";

export async function fetchTodos(_params: Record<string, never>, signal: AbortSignal): Promise<{ todos: Todo[] }> {
  const res = await fetch(`${API_BASE}/api/todos`, { signal });
  if (!res.ok) throw new Error(`Failed to load todos: ${res.status}`);
  return (await res.json()) as { todos: Todo[] };
}

// --- REST mutations the components call ---
export function apiAddTodo(title: string): Promise<Todo> {
  return fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }).then((r) => r.json() as Promise<Todo>);
}

export function apiToggleTodo(id: string): Promise<Todo> {
  return fetch(`/api/todos/${id}/toggle`, { method: "POST" }).then((r) => r.json() as Promise<Todo>);
}

export function apiRenameTodo(id: string, title: string): Promise<Todo> {
  return fetch(`/api/todos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }).then((r) => r.json() as Promise<Todo>);
}

export function apiDeleteTodo(id: string): Promise<void> {
  return fetch(`/api/todos/${id}`, { method: "DELETE" }).then(() => undefined);
}
```

- [ ] **Step 2: Commit**

```bash
git add examples/vite-realtime-todos/src/models.ts
git commit -m "feat(example): client model, state, and api helpers"
```

---

### Task 8: Live primitives (client)

**Files:**

- Create: `examples/vite-realtime-todos/src/live/liveClient.ts`
- Create: `examples/vite-realtime-todos/src/live/LiveProvider.tsx`
- Create: `examples/vite-realtime-todos/src/live/useLiveQuery.ts`
- Create: `examples/vite-realtime-todos/src/live/useLiveEntities.ts`

- [ ] **Step 1: Create `src/live/liveClient.ts`**

```ts
export type LiveClient = ReturnType<typeof createLiveClient>;

export function createLiveClient(socket: WebSocket) {
  const slices = new Map<string, Set<string>>(); // sliceKey -> topics
  let active = new Set<string>(); // topics the server currently knows

  const desired = () => new Set([...slices.values()].flatMap((s) => [...s]));

  const send = (type: "add" | "remove", topics: string[]) => {
    if (topics.length && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type, topics }));
    }
  };

  const reconcile = () => {
    const next = desired();
    send(
      "add",
      [...next].filter((t) => !active.has(t)),
    );
    send(
      "remove",
      [...active].filter((t) => !next.has(t)),
    );
    active = next;
  };

  // Reconnect: the server forgot our subscriptions — replay them.
  socket.addEventListener("open", () => {
    active = new Set();
    reconcile();
  });

  return {
    setSlice(key: string, topics: string[]) {
      slices.set(key, new Set(topics));
      reconcile();
    },
    clearSlice(key: string) {
      slices.delete(key);
      reconcile();
    },
  };
}
```

- [ ] **Step 2: Create `src/live/LiveProvider.tsx`**

```tsx
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { todoModel } from "../models.ts";
import { createLiveClient, type LiveClient } from "./liveClient.ts";
import { useLiveEntities } from "./useLiveEntities.ts";

// undefined = no provider; null = provider present but no socket (SSR).
const LiveContext = createContext<LiveClient | null | undefined>(undefined);

export function useLiveClient(): LiveClient | null {
  const client = useContext(LiveContext);
  if (client === undefined) throw new Error("useLiveClient must be used within <LiveProvider>");
  return client;
}

export function LiveProvider({ children }: { children: ReactNode }) {
  // WebSocket only exists in the browser — stay inert during SSR.
  const socket = useMemo(
    () => (typeof window === "undefined" ? null : new WebSocket(`ws://${window.location.host}/ws`)),
    [],
  );
  const client = useMemo(() => (socket ? createLiveClient(socket) : null), [socket]);

  useLiveEntities(todoModel, socket); // ingest pushes — one line per live model

  useEffect(() => () => socket?.close(), [socket]);

  return <LiveContext.Provider value={client}>{children}</LiveContext.Provider>;
}
```

- [ ] **Step 3: Create `src/live/useLiveEntities.ts`**

```ts
import { useEffect } from "react";
import type { ModelDescriptor } from "rxfy";
import { useModelStore } from "rxfy-react";

export function useLiveEntities<T>(model: ModelDescriptor<T>, socket: WebSocket | null) {
  const store = useModelStore(model);

  useEffect(() => {
    if (!socket) return;
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data) as { name: string; entities: unknown[] };
      if (msg.name !== model.name) return;
      store.setMany(msg.entities.map((row) => model.schema.parse(row)));
    };
    socket.addEventListener("message", handler);
    return () => socket.removeEventListener("message", handler);
  }, [store, socket, model]);
}
```

- [ ] **Step 4: Create `src/live/useLiveQuery.ts`**

```ts
import { useEffect, useId } from "react";
import type { ModelDescriptor } from "rxfy";
import { useLiveClient } from "./LiveProvider.tsx";

export function useLiveQuery<T>(model: ModelDescriptor<T>, ids: string[]) {
  const client = useLiveClient();
  const sliceKey = useId();
  // Primitive key keeps the effect deps simple and exhaustive-deps happy.
  const topicsKey = model.name ? ids.map((id) => `${model.name}:${id}`).join(",") : "";

  useEffect(() => {
    if (!client) return;
    return () => client.clearSlice(sliceKey);
  }, [client, sliceKey]);

  useEffect(() => {
    if (!client) return;
    client.setSlice(sliceKey, topicsKey ? topicsKey.split(",") : []);
  }, [client, sliceKey, topicsKey]);
}
```

- [ ] **Step 5: Commit**

```bash
git add examples/vite-realtime-todos/src/live
git commit -m "feat(example): client live primitives (client, provider, hooks)"
```

---

### Task 9: App component + styles

**Files:**

- Create: `examples/vite-realtime-todos/src/App.tsx`
- Create: `examples/vite-realtime-todos/src/App.css`
- Create: `examples/vite-realtime-todos/src/index.css`

- [ ] **Step 1: Create `src/App.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Pending, useObservable, useStateData } from "rxfy-react";
import { LiveProvider } from "./live/LiveProvider.tsx";
import { useLiveQuery } from "./live/useLiveQuery.ts";
import {
  apiAddTodo,
  apiDeleteTodo,
  apiRenameTodo,
  apiToggleTodo,
  fetchTodos,
  todoModel,
  todosState,
  useTodoStore,
} from "./models.ts";
import "./App.css";

// Subscribes to one todo's cell — re-renders when a push updates it, no list refetch.
function TodoItem({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
  const store = useTodoStore();
  const todo$ = useMemo(() => store.get(id), [store, id]);
  const [editing, setEditing] = useState(false);

  return (
    <Pending value$={todo$}>
      {(todo) => (
        <li className="todo-item">
          <input type="checkbox" checked={todo.done} onChange={() => void apiToggleTodo(todo.id)} />
          {editing ? (
            <input
              className="title-edit"
              autoFocus
              defaultValue={todo.title}
              onBlur={(e) => {
                setEditing(false);
                const next = e.target.value.trim();
                if (next && next !== todo.title) void apiRenameTodo(todo.id, next);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <span className={todo.done ? "done" : ""} onDoubleClick={() => setEditing(true)}>
              {todo.title}
            </span>
          )}
          <button className="remove" onClick={() => onRemove(todo.id)} aria-label="remove">
            ×
          </button>
        </li>
      )}
    </Pending>
  );
}

function TodoApp() {
  const params = useMemo(() => ({}), []);
  const { data$, mutations, reload } = useStateData(todosState, fetchTodos, params);
  const data = useObservable(data$);

  // Subscribe to live updates for exactly the ids this query fetched.
  useLiveQuery(todoModel, data?.todos ?? []);

  const [title, setTitle] = useState("");

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    const todo = await apiAddTodo(trimmed);
    mutations.addTodo(todo); // local list update; other tabs see it on reload
  };

  const handleRemove = async (id: string) => {
    await apiDeleteTodo(id);
    mutations.removeTodo(id);
  };

  // Wrappers so JSX event props get void-returning handlers (no-misused-promises).
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => void handleAdd(e);
  const onRemove = (id: string) => void handleRemove(id);

  return (
    <div className="app">
      <h1>realtime todos</h1>
      <p className="hint">Open this page in two tabs — toggling or renaming a todo updates both live.</p>
      <form className="add-form" onSubmit={onSubmit}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" />
        <button type="submit">Add</button>
        <button type="button" onClick={reload}>
          Reload
        </button>
      </form>
      <Pending
        value$={data$}
        pending={<p className="status">Loading…</p>}
        rejected={() => (
          <p className="status error">
            Failed to load. <button onClick={reload}>Retry</button>
          </p>
        )}
      >
        {({ todos }) =>
          todos.length === 0 ? (
            <p className="status">No todos yet.</p>
          ) : (
            <ul className="todo-list">
              {todos.map((id) => (
                <TodoItem key={id} id={id} onRemove={onRemove} />
              ))}
            </ul>
          )
        }
      </Pending>
    </div>
  );
}

export default function App() {
  return (
    <LiveProvider>
      <TodoApp />
    </LiveProvider>
  );
}
```

- [ ] **Step 2: Create `src/App.css`**

```css
.app {
  max-width: 32rem;
  margin: 3rem auto;
  padding: 0 1rem;
}

h1 {
  font-size: 1.8rem;
  margin-bottom: 0.25rem;
}

.hint {
  opacity: 0.6;
  font-size: 0.85rem;
  margin-top: 0;
}

.add-form {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
}

.add-form input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  background: transparent;
  color: inherit;
}

.add-form button,
.status button {
  padding: 0.5rem 0.9rem;
  border-radius: 0.5rem;
  border: 1px solid transparent;
  background: #646cff;
  color: white;
  cursor: pointer;
}

.add-form button[type="button"] {
  background: transparent;
  border-color: rgba(125, 125, 125, 0.4);
  color: inherit;
}

.todo-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(125, 125, 125, 0.2);
}

.todo-item span {
  flex: 1;
  cursor: text;
}

.todo-item span.done {
  text-decoration: line-through;
  opacity: 0.5;
}

.title-edit {
  flex: 1;
  padding: 0.25rem 0.4rem;
  border-radius: 0.35rem;
  border: 1px solid #646cff;
  background: transparent;
  color: inherit;
}

.remove {
  background: transparent;
  border: none;
  color: inherit;
  opacity: 0.4;
  font-size: 1.1rem;
  cursor: pointer;
}

.remove:hover {
  opacity: 1;
}

.status {
  opacity: 0.7;
}

.status.error {
  color: #ff6b6b;
}
```

- [ ] **Step 3: Create `src/index.css`**

```css
:root {
  font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;
}

body {
  margin: 0;
}

@media (prefers-color-scheme: light) {
  :root {
    color: #213547;
    background-color: #ffffff;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add examples/vite-realtime-todos/src/App.tsx examples/vite-realtime-todos/src/App.css examples/vite-realtime-todos/src/index.css
git commit -m "feat(example): app component and styles"
```

---

### Task 10: SSR entries + HTML

**Files:**

- Create: `examples/vite-realtime-todos/index.html`
- Create: `examples/vite-realtime-todos/src/entry-server.tsx`
- Create: `examples/vite-realtime-todos/src/entry-client.tsx`

- [ ] **Step 1: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>rxfy — realtime todos</title>
    <!--app-head-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <!--app-state-->
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/entry-server.tsx`**

```tsx
import { PassThrough } from "node:stream";
import { StrictMode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import App from "./App.tsx";

export function render(_url: string): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry(); // one per request

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <App />
        </StoreProvider>
      </StrictMode>,
      {
        // buffered mode: wait for every Suspense boundary, then emit the full document
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => resolve({ html, state: hydrationScript(dehydrate(registry)) }));
          pipe(sink);
        },
        onError(error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      },
    );
  });
}
```

- [ ] **Step 3: Create `src/entry-client.tsx`**

```tsx
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { StoreProvider } from "rxfy-react";
import App from "./App.tsx";
import "./index.css";

// Hydration state arrives via the server-injected window.__RXFY_SSR__ script —
// StoreProvider ingests it automatically.
hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider ssr>
      <App />
    </StoreProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Type-check the whole package**

Run: `cd examples/vite-realtime-todos && pnpm check-types`
Expected: no errors across `tsconfig.app.json` (src + shared) and `tsconfig.node.json` (server + shared). Fix any type errors before continuing — common culprits: `ModelDescriptor` import path, `import.meta.env.SSR` requiring `src/vite-env.d.ts`.

- [ ] **Step 5: Lint**

Run: `cd examples/vite-realtime-todos && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add examples/vite-realtime-todos/index.html examples/vite-realtime-todos/src/entry-server.tsx examples/vite-realtime-todos/src/entry-client.tsx
git commit -m "feat(example): SSR server/client entries and html shell"
```

---

### Task 11: Boot + smoke-test the server

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server in the background**

Run: `cd examples/vite-realtime-todos && pnpm dev`
Expected: logs `Server started at http://localhost:5175` with no unhandled errors. Leave it running for the next steps (run them in a second shell).

- [ ] **Step 2: Verify the REST API**

Run: `curl -s http://localhost:5175/api/todos`
Expected: `{"todos":[{"id":"1","title":"Buy groceries","done":false},{"id":"2","title":"Walk the dog","done":true},{"id":"3","title":"Read a book","done":false}]}`

- [ ] **Step 3: Verify SSR returns fulfilled HTML (no loading flash)**

Run: `curl -s http://localhost:5175/ | grep -c "Buy groceries"`
Expected: `1` or more — the seeded todo text is present in the server-rendered HTML (proves SSR fetched + rendered the list, not a "Loading…" shell). Also confirm the response contains `window.__RXFY_SSR__` (the hydration script): `curl -s http://localhost:5175/ | grep -c "__RXFY_SSR__"` → `1` or more.

- [ ] **Step 4: Verify a toggle persists**

Run: `curl -s -X POST http://localhost:5175/api/todos/1/toggle` then `curl -s http://localhost:5175/api/todos`
Expected: the toggle response shows `"done":true` for id `1`, and the subsequent list reflects it.

- [ ] **Step 5: Verify the WebSocket targeted push (the core behavior)**

Create a throwaway script `examples/vite-realtime-todos/scripts/ws-smoke.mjs`:

```js
import { WebSocket } from "ws";

const base = "ws://localhost:5175/ws";
const a = new WebSocket(base); // subscribes to todo:2
const b = new WebSocket(base); // subscribes to nothing

let received = { a: [], b: [] };
a.on("message", (d) => received.a.push(JSON.parse(d.toString())));
b.on("message", (d) => received.b.push(JSON.parse(d.toString())));

await new Promise((r) => setTimeout(r, 200));
a.send(JSON.stringify({ type: "add", topics: ["todo:2"] }));
await new Promise((r) => setTimeout(r, 200));

await fetch("http://localhost:5175/api/todos/2/toggle", { method: "POST" });
await new Promise((r) => setTimeout(r, 300));

console.log("A received:", JSON.stringify(received.a));
console.log("B received:", JSON.stringify(received.b));
if (received.a.length === 1 && received.a[0].name === "todo" && received.b.length === 0) {
  console.log("PASS: only the subscribed connection got the push");
} else {
  console.log("FAIL");
  process.exit(1);
}
a.close();
b.close();
```

Run: `cd examples/vite-realtime-todos && pnpm exec node scripts/ws-smoke.mjs`
Expected: `PASS: only the subscribed connection got the push`. (`ws` is available transitively via `@hono/node-ws`; if Node can't resolve it, run `pnpm add -D ws` first.)

- [ ] **Step 6: Stop the dev server and delete the throwaway script**

```bash
rm -rf examples/vite-realtime-todos/scripts
```

Stop the `pnpm dev` process.

- [ ] **Step 7: Commit (no-op if nothing changed)**

Nothing to commit if the script was removed and no source changed. If `ws` was added to `package.json`, revert it (it was only for the smoke test): restore `package.json` and re-run `pnpm install`, then `git status` should be clean for this task.

---

### Task 12: Production build verification

**Files:** none (verification only)

- [ ] **Step 1: Build client + server bundles**

Run: `cd examples/vite-realtime-todos && pnpm build`
Expected: `dist/client/` (with `index.html` + `assets/`) and `dist/server/entry-server.js` are produced with no errors.

- [ ] **Step 2: Boot the production server**

Run: `cd examples/vite-realtime-todos && pnpm preview`
Expected: `Server started at http://localhost:5175`.

- [ ] **Step 3: Smoke-test prod SSR + assets**

Run: `curl -s http://localhost:5175/ | grep -c "Buy groceries"` → `1`+, and confirm an `/assets/*.js` referenced in the HTML responds 200:
`curl -s http://localhost:5175/ | grep -o '/assets/[^"]*\.js' | head -1` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:5175<that-path>` → `200`.

- [ ] **Step 4: Stop the server**

Stop the `pnpm preview` process.

- [ ] **Step 5: Repo-wide check**

Run from repo root: `pnpm --filter rxfy-example-realtime-todos check-types && pnpm --filter rxfy-example-realtime-todos lint`
Expected: both pass.

---

### Task 13: README

**Files:**

- Create: `examples/vite-realtime-todos/README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# rxfy — realtime todos

Normalized rxfy state driven by **server-pushed updates over WebSockets**, with targeted
per-connection delivery. Built with Vite SSR · Hono · Drizzle (SQLite, in-memory).

See the guide: [Live updates over WebSockets](../../apps/docs/src/pages/guides/live-updates-websockets.mdx).

## Run

```bash
pnpm install            # from the repo root
pnpm --filter rxfy-example-realtime-todos dev
# open http://localhost:5175 in TWO browser tabs
```
````

Toggle a todo's checkbox or double-click its title to rename it in one tab — it updates in the
other **instantly**, with no list refetch. The server pushes that entity only to the
connections that fetched it.

## How it works

- **SSR first paint.** `useStateData` fetches `/api/todos`; the server renders the fulfilled
  list and inlines a hydration script — no loading flash.
- **Targeted live updates.** The client opens one WebSocket and tells the server which entity
  ids it depends on (`{ type: "add" | "remove", topics }`, topic = `todo:<id>`). The server
  keeps **one dependency set per connection** and, on a change, pushes the entity only to the
  connections whose set includes it (`server/hub.ts`). Each client applies the push with
  `store.setMany`, so every subscriber of that entity re-renders — no refetch, no re-select.

## The boundary: values vs. list membership

A push updates an entity's **value** (toggle, rename) and reaches every subscriber. It does
**not** change which ids a query lists — `data$` is an id array owned by the query cache. So:

- **Adding / removing** a todo updates the acting tab locally (a `useStateData` mutation +
  the REST write) and **other tabs pick it up on Reload**.
- Live cross-tab list membership would need a separate list-level message; the per-entity
  socket here is the deliberate sweet spot.

````

- [ ] **Step 2: Commit**

```bash
git add examples/vite-realtime-todos/README.md
git commit -m "docs(example): realtime-todos README"
````

---

## Notes for the implementer

- **WS + Vite HMR coexistence:** in middleware mode without `server.hmr.server`, Vite runs HMR on its own WebSocket (separate port), so `@hono/node-ws` owns the main server's `upgrade` event for `/ws` without conflict. If HMR is degraded in dev, that's acceptable for this example and orthogonal to the app-level socket.
- **SSR self-fetch:** during SSR `fetchTodos` calls `http://localhost:5175/api/todos` (absolute). This is a same-server sub-request handled concurrently by Node's event loop — not a deadlock. It keeps `better-sqlite3` out of the client bundle (the client never imports `server/`).
- **In-memory SQLite** resets each boot; that's intentional for a zero-setup example.
- If any rxfy API name differs from what's used here (e.g. `useObservable`, `ModelDescriptor`, `store.setMany`), check the installed `packages/rxfy` / `packages/rxfy-react` exports and the sibling `examples/vite-todo` for the current shape, and adjust — do not invent names.
