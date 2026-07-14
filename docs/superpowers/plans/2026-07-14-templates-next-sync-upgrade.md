# templates/next Sync Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `templates/next` from an SSR-hydrate-only todos demo into a full real-time **sync-todos** app with feature parity to `templates/vite` (live "new todo" badge + live toggle patches), so both starters tell the same sync story.

**Architecture:** Port `templates/vite`'s todos domain (PGlite/drizzle storage, `createSync`, hono `/api` with `serve()`+`$grant`, updates badge) onto `examples/next-blog`'s Next+WebSocket architecture: a custom `server.mts` hosts Next **and** a `ws` `WebSocketServer` on `/live`; the hono `/api` app is served through a Next catch-all route handler (`hono/vercel`); RSC pages fetch in-process via a typed `serverApi` and pass the payload (carrying `$grant`) down as `defaultData`; the browser lifts the grant and subscribes. Hub + PGlite are pinned on `globalThis` so the custom-server bundle and Next's route-handler bundle share one instance.

**Tech Stack:** Next.js 16 App Router, React 19, Hono + `hono/vercel`, rxfy / rxfy-react / rxfy-client / rxfy-ws / rxfy-server / rxfy-server-drizzle, drizzle-orm + @electric-sql/pglite, `ws`, tsx, Vitest.

**Reference files (read before starting):**

- Domain + engine to port: `templates/vite/src/{todos,resources}.ts`, `templates/vite/src/db/schema.ts`, `templates/vite/server/{db,sync,api}.ts`, `templates/vite/server/sync.smoke.test.ts`, `templates/vite/src/pages/TodosPage.tsx`.
- Next+sync wiring to adopt: `examples/next-blog/server.mts`, `examples/next-blog/src/server/{sync,app}.ts`, `examples/next-blog/src/app/api/[[...route]]/route.ts`, `examples/next-blog/src/blog/{api-server,api-client,sync-client}.ts`, `examples/next-blog/src/providers.tsx`, `examples/next-blog/src/components/HomeView.tsx`, `examples/next-blog/src/app/page.tsx`.

**Conventions:**

- **Extensionless relative imports** (e.g. `from "./db"`, not `./db.js`) — Next/Turbopack + tsx convention used by every Next app here (`examples/next-blog`). Do NOT copy `templates/vite`'s `.js` extensions.
- No `turbo/no-undeclared-env-vars` eslint-disable comments — `templates/next` uses `eslint-config-next` only (no turbo plugin); such a disable would error as an unknown rule.
- Prettier: 120 print width, double quotes, semicolons, trailing commas.
- Commit messages: no `Co-Authored-By` trailer.

**Verification commands used throughout (run from repo root):**

- Build workspace deps + this app: `turbo build --filter=rxfy-template-next`
- Typecheck: `pnpm --filter rxfy-template-next check-types`
- Lint: `pnpm --filter rxfy-template-next lint`
- Unit/smoke tests: `pnpm --filter rxfy-template-next test`

> **Ordering note:** the app will not fully typecheck until the domain, server, and client tasks all land (they reference each other). Tasks are ordered bottom-up (deps → domain → storage → engine → api → server → client → tests → cleanup) to minimize dangling references. Per-task checks that require the whole graph are called out explicitly; where a task can't independently typecheck, its verification is the smoke test or the final Task 12 gate.

---

## Task 1: Dependencies and scripts

**Files:**

- Modify: `templates/next/package.json`

- [ ] **Step 1: Rewrite `package.json`**

Replace the whole file with:

```json
{
  "name": "rxfy-template-next",
  "version": "0.0.0",
  "private": true,
  "description": "rxfy live app: Next.js App Router + Hono + Drizzle/PGlite + real-time updates over WebSocket",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "tsx server.mts",
    "build": "next build",
    "start": "cross-env NODE_ENV=production tsx server.mts",
    "clean": "rimraf .next",
    "lint": "eslint .",
    "check-types": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@electric-sql/pglite": "^0.5.3",
    "@hono/zod-validator": "^0.8.0",
    "drizzle-orm": "^0.45.2",
    "hono": "^4.7.0",
    "lodash": "^4.17.21",
    "next": "^16.2.9",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "rxfy": "workspace:*",
    "rxfy-client": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxfy-server": "workspace:*",
    "rxfy-server-drizzle": "workspace:*",
    "rxfy-ws": "workspace:*",
    "rxjs": "^7.8.2",
    "ws": "^8.18.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.2",
    "@types/lodash": "^4.17.17",
    "@types/node": "^22.15.29",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@types/ws": "^8.18.1",
    "cross-env": "^7.0.3",
    "eslint": "^9.27.0",
    "eslint-config-next": "^16.2.9",
    "rimraf": "^6.0.1",
    "tailwindcss": "^4.3.2",
    "tsx": "^4.22.4",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  }
}
```

- [ ] **Step 2: Install**

Run: `corepack pnpm install`
Expected: completes; `rxfy-client`, `rxfy-ws`, `rxfy-server`, `rxfy-server-drizzle`, `drizzle-orm`, `@electric-sql/pglite`, `hono`, `ws`, `tsx`, `cross-env` resolve for `rxfy-template-next`.

- [ ] **Step 3: Commit**

```bash
git add templates/next/package.json pnpm-lock.yaml
git commit -m "chore(template-next): add sync engine deps; switch to custom tsx server"
```

---

## Task 2: Todos domain (model, state, schemas)

**Files:**

- Create: `templates/next/src/todos.ts`
- Delete (later, in Task 12): `templates/next/src/lib/todos.ts`

- [ ] **Step 1: Create `src/todos.ts`**

```ts
import { array, createModel, defineState } from "rxfy";
import { z } from "zod";

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export type Todo = z.infer<typeof TodoSchema>;

/** Per-endpoint write payloads, derived from the entity schema — used by the server's validators. */
export const CreateTodoInputSchema = TodoSchema.pick({ title: true });
export const UpdateTodoInputSchema = TodoSchema.pick({ done: true });

/** `name` is required for SSR dehydration and doubles as the live topic namespace ("todo:<id>"). */
export const todoModel = createModel({ schema: TodoSchema, getKey: (t) => t.id, name: "todo" });

/** `key` is required for SSR query-cache dehydration. No mutations: writes go through the API and
 * land via applyUpdates (create) or an entity patch (toggle). */
export const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: {
    todos: array(todoModel),
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add templates/next/src/todos.ts
git commit -m "feat(template-next): add todos model/state/schemas"
```

---

## Task 3: Drizzle schema

**Files:**

- Create: `templates/next/src/db/schema.ts`

- [ ] **Step 1: Create `src/db/schema.ts`**

```ts
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const todos = pgTable("todos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Commit**

```bash
git add templates/next/src/db/schema.ts
git commit -m "feat(template-next): add todos drizzle schema"
```

---

## Task 4: Resource registry

**Files:**

- Create: `templates/next/src/resources.ts`

- [ ] **Step 1: Create `src/resources.ts`**

```ts
import { createResourceRegistry } from "rxfy-server";
import { defineResource } from "rxfy-server-drizzle";
import { todos } from "./db/schema";
import { todoModel } from "./todos";

export const todoResource = defineResource({ table: todos, model: todoModel });

export const resources = createResourceRegistry([todoResource]);
```

- [ ] **Step 2: Commit**

```bash
git add templates/next/src/resources.ts
git commit -m "feat(template-next): add todo resource registry"
```

---

## Task 5: Database (PGlite + drizzle) with shared init

**Files:**

- Create: `templates/next/src/server/db.ts`

**Why globalThis pinning:** in a Next custom-server setup the WebSocket server (in `server.mts`) and the hono route handlers (in Next's route-handler bundle) are separate module graphs in the **same process**. Pinning the PGlite client and the init promise on `globalThis` guarantees one DB instance and one seed, and the idempotent DDL (`CREATE TABLE IF NOT EXISTS`) + seed-if-empty makes `initDb()` safe to call from either entry.

- [ ] **Step 1: Create `src/server/db.ts`**

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { todos } from "../db/schema";

// One PGlite instance + one init promise per process, shared across bundles via globalThis.
const globalForDb = globalThis as unknown as { __rxfyPglite?: PGlite; __rxfyDbReady?: Promise<void> };
const client = (globalForDb.__rxfyPglite ??= new PGlite());
export const db = drizzle(client);

const DDL = `
  CREATE TABLE IF NOT EXISTS todos (
    id text PRIMARY KEY,
    title text NOT NULL,
    done boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  );
`;

/** Create tables + seed once. Idempotent (safe if called from both the server and a route handler). */
export function initDb(): Promise<void> {
  return (globalForDb.__rxfyDbReady ??= (async () => {
    await client.exec(DDL);
    const existing = await db.select().from(todos).limit(1);
    if (existing.length > 0) return;
    await db.insert(todos).values([
      { id: "t1", title: "Open this app in a second tab", done: false },
      { id: "t2", title: "Toggle me — the other tab updates instantly", done: false },
      { id: "t3", title: "Add a todo — the other tab shows a refresh badge", done: false },
    ]);
  })());
}

export { todos };
```

- [ ] **Step 2: Commit**

```bash
git add templates/next/src/server/db.ts
git commit -m "feat(template-next): add PGlite/drizzle db with shared idempotent init"
```

---

## Task 6: Sync engine (hub + createSync)

**Files:**

- Create: `templates/next/src/server/sync.ts`

- [ ] **Step 1: Create `src/server/sync.ts`**

```ts
import { createInMemoryHub, createSync, type Hub } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { db } from "./db";

// One hub per process, shared across bundles via globalThis: the WebSocket server (server.mts) and
// the route handlers that publish (sync.create/update/touch) must share it or subscriptions never
// receive publishes.
const globalForHub = globalThis as unknown as { __rxfyTodosHub?: Hub };
export const hub: Hub = (globalForHub.__rxfyTodosHub ??= createInMemoryHub());

// HMAC secret for signing/verifying channel grants — shared with the WebSocket server so grants
// signed by sync.serve verify there. Override via RXFY_SECRET in production.
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

export const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
```

- [ ] **Step 2: Commit**

```bash
git add templates/next/src/server/sync.ts
git commit -m "feat(template-next): add sync engine (shared hub + drizzle storage)"
```

---

## Task 7: Sync smoke test (TDD for the engine)

**Files:**

- Create: `templates/next/src/server/sync.smoke.test.ts`

This test is self-contained (spins its own PGlite + hub + in-memory socket pair) and exercises the full grant → subscribe → publish path against the real `todoResource`/`todosState`/`todoModel`. It depends only on Tasks 2 and 4.

- [ ] **Step 1: Create `src/server/sync.smoke.test.ts`**

```ts
import { EventEmitter } from "node:events";
import { createModelRegistry, normalizeResult, stateChannel } from "rxfy";
import type { SyncClient } from "rxfy-client";
import { createSyncClient } from "rxfy-client";
import type { Hub, PublishSink } from "rxfy-server";
import { createInMemoryHub, createSync, touch } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { createWsServer } from "rxfy-ws";
import type { WebSocketLike } from "rxfy-ws/client";
import { createWsClient } from "rxfy-ws/client";
import { describe, expect, it } from "vitest";
import { resources, todoResource } from "../resources";
import { todoModel, todosState } from "../todos";

const SECRET = "test-secret";

/** Derive ServerMessage from the PublishSink type exported by rxfy-server. */
type ServerMessage = Parameters<PublishSink>[1];

async function freshDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client);
  await client.exec(`
    CREATE TABLE todos (id text PRIMARY KEY, title text NOT NULL, done boolean NOT NULL DEFAULT false, created_at timestamp NOT NULL DEFAULT now());
  `);
  return db;
}

/**
 * Wire a real sync client to the hub over the same WebSocket bridge the app uses: an in-memory
 * socket pair carries `subscribe` frames to `createWsServer` (which verifies the grant) and carries
 * published messages back to `createWsClient` → `createSyncClient`. No network, but the full
 * grant → subscribe → verify → publish path runs.
 */
function connectClient(hub: Hub, registry: ReturnType<typeof createModelRegistry>): SyncClient {
  const wsServer = createWsServer(hub, { secret: SECRET });
  const serverEmitter = new EventEmitter();
  const clientListeners = new Map<string, ((event: unknown) => void)[]>();

  const clientSocket: WebSocketLike = {
    readyState: 1, // OPEN — the sync client sends subscribe frames immediately
    send: (data: string) => serverEmitter.emit("message", data), // client → server
    close: () => serverEmitter.emit("close"),
    addEventListener: (type, listener) => {
      const arr = clientListeners.get(type) ?? [];
      arr.push(listener);
      clientListeners.set(type, arr);
    },
  };

  wsServer.handleConnection({
    // server → client: dispatch a `message` event to the client socket's listeners
    send: (data: string) => clientListeners.get("message")?.forEach((l) => l({ data })),
    on: (event, cb) => serverEmitter.on(event, cb),
  });

  const transport = createWsClient({ url: "ws://test", WebSocketImpl: () => clientSocket });
  return createSyncClient({ registry, transport });
}

// Generous timeouts: each test cold-starts a PGlite (wasm Postgres) instance, several times slower on CI.
describe("sync server", () => {
  it("registers the todo resource", () => {
    expect(resources.byName("todo")).toBe(todoResource);
  });

  it("create persists and touches the todos channel with a bare stale", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["c:todos"], Date.now() + 60_000);

    const row = await sync.create(
      todoResource,
      { id: "t1", title: "Hi", done: false },
      { touch: [touch(todosState, {})] },
    );
    expect(row).toMatchObject({ id: "t1", title: "Hi" });
    expect(received).toEqual([{ v: 2, kind: "stale", channel: "todos" }]);
  }, 30_000);

  it("update broadcasts a patch on the entity topic", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(todoResource, { id: "t1", title: "Hi", done: false });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe(0, ["e:todo:t1"], Date.now() + 60_000);

    const row = await sync.update(todoResource, "t1", { done: true });
    expect(row).toMatchObject({ id: "t1", done: true });
    expect(received).toEqual([
      {
        v: 2,
        kind: "patch",
        name: "todo",
        id: "t1",
        data: { id: "t1", title: "Hi", done: true, createdAt: expect.any(Date) },
      },
    ]);
  }, 30_000);
});

describe("live end-to-end over the grant/WebSocket path", () => {
  it("serve → $grant lift → subscribe → sync.update patches the client's model store", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(todoResource, { id: "t1", title: "Hi", done: false });

    const registry = createModelRegistry(todoModel);
    const syncClient = connectClient(hub, registry);

    const served = sync.serve(todosState, {}, { todos: [{ id: "t1", title: "Hi", done: false }] });
    const { $grant, ...payload } = served;

    normalizeResult(registry, todosState.fields, payload);
    syncClient.subscribe($grant);

    const row = await sync.update(todoResource, "t1", { done: true });
    expect(row).toMatchObject({ id: "t1", done: true });

    expect(registry.model(todoModel).getValue("t1")).toMatchObject({ id: "t1", done: true });

    syncClient.stop();
  }, 30_000);

  it("serve → $grant lift → subscribe → touch bumps the client's channel counter (stale)", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
    await sync.create(todoResource, { id: "t1", title: "Hi", done: false });

    const registry = createModelRegistry(todoModel);
    const syncClient = connectClient(hub, registry);

    const channel = stateChannel(todosState, {})!;
    const counter = syncClient.channel(channel);
    let available = 0;
    const sub = counter.available$.subscribe((n) => (available = n));

    const served = sync.serve(todosState, {}, { todos: [{ id: "t1", title: "Hi", done: false }] });
    const { $grant, ...payload } = served;
    normalizeResult(registry, todosState.fields, payload);
    syncClient.subscribe($grant);

    sync.touch(touch(todosState, {}));
    expect(available).toBe(1);

    sub.unsubscribe();
    syncClient.stop();
  }, 30_000);
});
```

- [ ] **Step 2: Build workspace deps, then run the smoke test**

Run: `turbo build --filter=rxfy-template-next` then `pnpm --filter rxfy-template-next test`
Expected: the 5 tests in `sync.smoke.test.ts` PASS. (If `rxfy-*` packages aren't built yet, the build step resolves that; the test imports built `rxfy`/`rxfy-server`/etc.)

- [ ] **Step 3: Commit**

```bash
git add templates/next/src/server/sync.smoke.test.ts
git commit -m "test(template-next): sync engine smoke test (grant → subscribe → publish)"
```

---

## Task 8: Hono API app + Next catch-all route + in-process server client

**Files:**

- Create: `templates/next/src/server/app.ts`
- Create: `templates/next/src/app/api/[[...route]]/route.ts`
- Create: `templates/next/src/server/api-server.ts`

- [ ] **Step 1: Create `src/server/app.ts`**

```ts
import crypto from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { touch } from "rxfy-server";
import { todoResource } from "../resources";
import { CreateTodoInputSchema, todosState, UpdateTodoInputSchema } from "../todos";
import { db, todos } from "./db";
import { sync } from "./sync";

const newId = () => crypto.randomUUID();

// basePath "/api" so the browser client (hc<AppType>("/").api) and the Next catch-all
// (src/app/api/[[...route]]/route.ts) agree on the URL shape.
export const app = new Hono()
  .basePath("/api")
  .get("/todos", async (c) => {
    const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
    // serve() parses the rows through the state's schemas and attaches a signed channel grant as
    // `$grant`; the client lifts it and subscribes on its own WebSocket. Stateless — no request needed.
    return c.json(sync.serve(todosState, {}, { todos: rows }));
  })
  .post("/live/renew", async (c) => {
    // The client posts grants nearing expiry; renew() reissues each (or null when denied).
    const { grants } = await c.req.json<{ grants: string[] }>();
    return c.json({ grants: grants.map((g) => sync.renew(g)) });
  })
  .post("/todos", zValidator("json", CreateTodoInputSchema), async (c) => {
    const { title } = c.req.valid("json");
    const row = await sync.create(
      todoResource,
      { id: newId(), title, done: false },
      { touch: [touch(todosState, {})] },
    );
    return c.json(row);
  })
  .patch("/todos/:id", zValidator("json", UpdateTodoInputSchema), async (c) => {
    const { done } = c.req.valid("json");
    const row = await sync.update(todoResource, c.req.param("id"), { done });
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  });

export type AppType = typeof app;
```

- [ ] **Step 2: Create `src/app/api/[[...route]]/route.ts`**

```ts
import { handle } from "hono/vercel";
import { app } from "../../../server/app";

// Serves the hono /api app through Next's App Router (the custom server hands non-/live requests to Next).
export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
```

- [ ] **Step 3: Create `src/server/api-server.ts`**

```ts
import { hc } from "hono/client";
import { app, type AppType } from "./app";

/**
 * The server-side typed RPC client — RSC pages fetch through it during render. It routes requests
 * straight into the hono app in-process (no HTTP self-call), so the endpoints stay the single data
 * source in both environments. Each read returns a signed channel grant as `$grant`, which rides
 * along in `defaultData` to the browser. Server-only: import from server components exclusively.
 * `.api` unwraps the app's `/api` basePath.
 */
export const serverApi = hc<AppType>("http://ssr.internal", { fetch: app.request }).api;
```

- [ ] **Step 4: Commit**

```bash
git add "templates/next/src/server/app.ts" "templates/next/src/app/api/[[...route]]/route.ts" "templates/next/src/server/api-server.ts"
git commit -m "feat(template-next): hono /api (serve/create/toggle/renew) + Next catch-all + serverApi"
```

---

## Task 9: SSR data-path smoke test (serve + grant)

**Files:**

- Create: `templates/next/src/server/app.smoke.test.ts`

This exercises the exact in-process path an RSC page uses: `initDb()` → `app.request("/api/todos")` → seeded rows + a signed `$grant`.

- [ ] **Step 1: Create `src/server/app.smoke.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { app } from "./app";
import { initDb } from "./db";

describe("SSR data path (in-process hono serve)", () => {
  it("serves seeded todos with a signed channel grant", async () => {
    await initDb();
    const res = await app.request("/api/todos");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { todos: { title: string }[]; $grant: string };
    expect(body.todos.some((t) => t.title === "Open this app in a second tab")).toBe(true);
    expect(typeof body.$grant).toBe("string");
    expect(body.$grant.length).toBeGreaterThan(0);
  }, 30_000);
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm --filter rxfy-template-next test`
Expected: `app.smoke.test.ts` (1 test) and `sync.smoke.test.ts` (5 tests) PASS. The old `src/lib/ssr.test.ts` still exists and also passes for now (removed in Task 11).

- [ ] **Step 3: Commit**

```bash
git add templates/next/src/server/app.smoke.test.ts
git commit -m "test(template-next): SSR data-path smoke (serve + grant)"
```

---

## Task 10: Custom server (Next + WebSocket)

**Files:**

- Create: `templates/next/server.mts`

`next start` cannot host a WebSocket, so a custom server hosts Next and a `ws` `WebSocketServer` on `/live`; the hono `/api` app is dispatched by Next itself through the catch-all route from Task 8.

- [ ] **Step 1: Create `server.mts`** (at `templates/next/server.mts`)

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add templates/next/server.mts
git commit -m "feat(template-next): custom Next + WebSocket server on /live"
```

---

## Task 11: Browser clients (typed RPC + sync client)

**Files:**

- Create: `templates/next/src/api-client.ts`
- Create: `templates/next/src/sync-client.ts`

- [ ] **Step 1: Create `src/api-client.ts`**

```ts
import { hc } from "hono/client";
import type { AppType } from "./server/app";

/**
 * The browser-side typed RPC client — refetches and mutations go over HTTP to the same endpoints
 * the RSC pages call in-process (see server/api-server.ts). Sync subscriptions ride channel grants
 * (returned in each read as `$grant`), so requests carry no session header. SSR never fetches
 * through it: pages pass RSC-fetched data down as `defaultData`. `.api` unwraps the `/api` basePath.
 */
export const api = hc<AppType>("/").api;
```

- [ ] **Step 2: Create `src/sync-client.ts`**

```ts
import { createModelRegistry } from "rxfy";
import { createSyncClient } from "rxfy-client";
import { createWsClient } from "rxfy-ws/client";

/**
 * Browser-only sync wiring, created once per page load: the shared model registry, the WebSocket
 * transport, and the sync client that routes patch/stale messages into it. Grants lifted from the
 * served payloads subscribe on this socket; the renew route reissues each grant before it expires.
 * `undefined` during SSR — the server render has no socket, and StoreProvider falls back to its own
 * registry.
 */
export const sync =
  typeof window === "undefined"
    ? undefined
    : (() => {
        const registry = createModelRegistry();
        const transport = createWsClient({
          url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`,
        });
        const syncClient = createSyncClient({ registry, transport, renewUrl: "/api/live/renew" });
        return { registry, transport, syncClient };
      })();
```

- [ ] **Step 3: Commit**

```bash
git add templates/next/src/api-client.ts templates/next/src/sync-client.ts
git commit -m "feat(template-next): browser typed RPC + sync client"
```

---

## Task 12: Providers, TodosView, page (client consumption) + remove dead code

**Files:**

- Modify: `templates/next/src/providers.tsx`
- Modify: `templates/next/src/components/TodosView.tsx`
- Modify: `templates/next/src/app/page.tsx`
- Delete: `templates/next/src/components/HydrateSnapshot.tsx`
- Delete: `templates/next/src/lib/todos.ts`, `templates/next/src/lib/ssr.ts`, `templates/next/src/lib/ssr.test.ts`, `templates/next/src/lib/store.ts`, `templates/next/src/lib/actions.ts`
- Delete: `templates/next/src/app/api/todos/route.ts`

- [ ] **Step 1: Rewrite `src/providers.tsx`**

```tsx
"use client";
import type { ReactNode } from "react";
import { StoreProvider } from "rxfy-react";
import { HydrationStream } from "rxfy-react/next";
import { sync } from "./sync-client";

export function RxfyProvider({ children }: { children: ReactNode }) {
  // In the browser the registry + sync client come from the live singleton, so patch/stale messages
  // land in the same stores the views read; during SSR `sync` is undefined and StoreProvider creates
  // its own per-render registry.
  return (
    <StoreProvider ssr registry={sync?.registry} syncClient={sync?.syncClient}>
      <HydrationStream />
      {children}
    </StoreProvider>
  );
}
```

- [ ] **Step 2: Rewrite `src/components/TodosView.tsx`**

```tsx
"use client";
import { parseResponse } from "hono/client";
import { useState } from "react";
import { Pending, useAtom, useModelStore, useStateData } from "rxfy-react";
import { api } from "../api-client";
import { todoModel, todosState, type Todo } from "../todos";

// Subscribes to one entity by id — a store patch for this id re-renders only this item.
function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  const [todo] = useAtom(store.get(id));
  return (
    <li>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={todo.done}
          // Persist the toggle; sync.update broadcasts an entity patch, so other tabs update live.
          onChange={() =>
            void parseResponse(api.todos[":id"].$patch({ param: { id: todo.id }, json: { done: !todo.done } }))
          }
        />
        <span className={todo.done ? "line-through opacity-60" : ""}>{todo.title}</span>
      </label>
    </li>
  );
}

export function TodosView({ defaultData }: { defaultData: { todos: Todo[] } }) {
  const [title, setTitle] = useState("");
  // defaultData carries the RSC-fetched todos plus `$grant`; useStateData seeds the store and lifts
  // the grant to subscribe — no fetch on first paint.
  const { data$, updatesAvailable$, applyUpdates } = useStateData({
    state: todosState,
    fetchFn: () => parseResponse(api.todos.$get()),
    params: {},
    defaultData,
  });

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">rxfy live todos</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          setTitle("");
          void parseResponse(api.todos.$post({ json: { title: next } }))
            .then(() => applyUpdates())
            .catch(() => setTitle(next)); // restore the input so a failed create isn't lost
        }}
      >
        <input
          className="flex-1 rounded border px-2 py-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
        />
        <button className="rounded border px-3 py-1" type="submit">
          Add
        </button>
      </form>
      <Pending value$={updatesAvailable$}>
        {(n) =>
          n > 0 && (
            <button className="updates-badge rounded border px-3 py-1" onClick={applyUpdates}>
              {n} new — refresh
            </button>
          )
        }
      </Pending>
      <Pending value$={data$} pending={<p>Loading…</p>} rejected={(w) => <p>Failed: {String(w.error)}</p>}>
        {({ todos }) => (
          <ul className="flex flex-col gap-2">
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )}
      </Pending>
    </main>
  );
}
```

- [ ] **Step 3: Rewrite `src/app/page.tsx`**

```tsx
import { parseResponse } from "hono/client";
import { TodosView } from "../components/TodosView";
import { serverApi } from "../server/api-server";

// Each read is served with a freshly signed, time-limited channel grant, so the payload varies per
// request — the page can't be statically prerendered.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // The in-process fetch returns the todos plus a `$grant`; it rides down as defaultData, and the
  // browser's sync client lifts the grant and subscribes.
  const todos = await parseResponse(serverApi.todos.$get());
  return <TodosView defaultData={todos} />;
}
```

- [ ] **Step 4: Delete dead files and the now-empty `lib/` dir**

```bash
git rm templates/next/src/components/HydrateSnapshot.tsx \
  templates/next/src/lib/todos.ts templates/next/src/lib/ssr.ts templates/next/src/lib/ssr.test.ts \
  templates/next/src/lib/store.ts templates/next/src/lib/actions.ts \
  "templates/next/src/app/api/todos/route.ts"
```

Expected: `templates/next/src/lib/` is now empty and removed by git; `src/app/api/todos/` removed (only `[[...route]]` remains under `src/app/api/`).

- [ ] **Step 5: Typecheck, lint, test, build**

Run each; all must pass:

- `pnpm --filter rxfy-template-next check-types`
- `pnpm --filter rxfy-template-next lint`
- `pnpm --filter rxfy-template-next test` — 6 tests (5 sync + 1 app), no `lib/ssr.test.ts`.
- `turbo build --filter=rxfy-template-next` — `next build` succeeds (App Router compiles the catch-all route + force-dynamic page).

- [ ] **Step 6: Commit**

```bash
git add templates/next/src/providers.tsx templates/next/src/components/TodosView.tsx templates/next/src/app/page.tsx
git commit -m "feat(template-next): live TodosView (updates badge + patching toggle), RSC defaultData, drop hydrate/server-action path"
```

---

## Task 13: Template metadata + manual two-tab verification

**Files:**

- Modify: `templates/next/template.json`

- [ ] **Step 1: Update `template.json`**

```json
{
  "order": 4,
  "display": "Next.js (App Router, sync SSR app)",
  "description": "Full sync stack: Next.js App Router, Hono, Drizzle + PGlite, real-time updates over WebSocket"
}
```

- [ ] **Step 2: Manual verification (use the `run`/`verify` skill or run directly)**

Run the production build + server:

```bash
turbo build --filter=rxfy-template-next
PORT=4306 pnpm --filter rxfy-template-next start
```

Then in a browser:

1. Open `http://localhost:4306` in **two** tabs (A and B). Both show the three seeded todos.
2. In tab B, type a title and click **Add**. Tab A shows a `.updates-badge` button "1 new — refresh". Click it in A → the new todo appears in A's list.
3. In tab B, toggle a todo's checkbox. Tab A reflects the new checked state **live, with no refresh** (entity patch).
4. Reload tab A → the added todo and toggle state persist (server-side PGlite).

Expected: all four behaviors hold. Stop the server when done.

- [ ] **Step 3: Commit**

```bash
git add templates/next/template.json
git commit -m "docs(template-next): update template metadata to sync SSR app"
```

---

## Task 14: Final repo-level verification

- [ ] **Step 1: Full checks across the affected graph**

Run each; all must pass:

- `turbo build --filter=rxfy-template-next` — PASS
- `pnpm --filter rxfy-template-next check-types` — PASS
- `pnpm --filter rxfy-template-next lint` — PASS
- `pnpm --filter rxfy-template-next test` — 6 tests PASS
- `pnpm format:check` (or `pnpm format` then re-check) — no formatting drift in `templates/next`

- [ ] **Step 2: Confirm no stray references to removed modules**

Run: `grep -rn "lib/store\|lib/actions\|lib/ssr\|lib/todos\|HydrateSnapshot\|createTodo\|api/todos/route" templates/next/src templates/next/server.mts`
Expected: no matches.

- [ ] **Step 3: Done**

`templates/next` is now a live sync-todos app at parity with `templates/vite`, exposing the shared `sync-todos` selectors (`input[placeholder="What needs doing?"]`, an "Add" button, `button.updates-badge` "N new — refresh", `<li>` items with checkboxes) — unblocking Spec 2 (the Playwright e2e suite).

---

## Notes on risks (from the spec) and how this plan handles them

- **HydrateSnapshot vs HydrationStream:** replaced by `<HydrationStream />` + `StoreProvider ssr registry/syncClient` exactly as `examples/next-blog` does (which has no HydrateSnapshot). If a hydration mismatch appears on the todos page during manual verification, capture the console error and treat it as a bug to fix before Task 14 — do not reintroduce HydrateSnapshot without cause.
- **Custom server + Next 16:** mirrors `examples/next-blog/server.mts` verbatim in structure; it already runs on `next ^16.2.9`. Dev HMR socket is routed to Next's `handleUpgrade`; only `/live` goes to `ws`.
- **PGlite/hub singletons:** hub and PGlite (client + init promise) are pinned on `globalThis`, and DDL is `IF NOT EXISTS` + seed-if-empty, so the custom-server bundle and the route-handler bundle share one instance and never double-seed.
- **WS port:** served on the **same** HTTP port at `/live` (no sibling port), so Spec 2's port assignment for `rxfy-template-next` is a single `PORT`.
- **Storage choice:** PGlite/drizzle (parity with `templates/vite`), not `rxfy-server-memory` (which `examples/next-blog` uses), so the toggle produces a real persisted entity patch and the ported smoke test matches `templates/vite`'s.
