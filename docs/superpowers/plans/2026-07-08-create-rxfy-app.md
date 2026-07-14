# create-rxfy-app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `create-rxfy-app` scaffolding CLI plus a standalone `templates/vite` live-framework starter (Vite SSR + React Router + Hono + Drizzle/PGlite + rxfy live updates), so newcomers get a runnable app with `pnpm create rxfy-app` instead of assembling the framework stack by hand.

**Architecture:** Templates are hand-maintained workspace packages under `templates/` (CI-covered via turbo). The CLI package bundles them at build time into `dist/templates`, rewriting `workspace:*` deps to the current published versions. Scaffolding copies a template, renames `_gitignore`, and rewrites the package name. Spec: `docs/superpowers/specs/2026-07-08-create-rxfy-app-design.md`.

**Tech Stack:** TypeScript, tsup (ESM CLI), `@clack/prompts` + `picocolors`, `node:util` `parseArgs`, Vitest. Template: Vite 6, React 19, react-router 7 (declarative/library mode), Hono, Drizzle + PGlite, rxfy/rxfy-react/rxfy-server/rxfy-ws.

**Conventions:** Prettier 120 width, double quotes, semicolons, trailing commas. Import TS files with `.js` extensions (repo style, resolved by tsx/vite). Commit messages: conventional commits, NO Co-Authored-By trailers.

---

## File Structure

```
pnpm-workspace.yaml                 # modify: add templates/*
.changeset/config.json              # modify: ignore rxfy-template-*
.changeset/create-rxfy-app.md       # create: minor changeset

templates/vite/                     # new workspace package "rxfy-template-vite" (private)
  template.json                     # CLI picker metadata (display, description)
  package.json                      # workspace:* rxfy deps; dev/build/preview/test scripts
  .gitignore                        # real gitignore in-repo; becomes _gitignore in the bundle
  README.md
  index.html                        # <!--app-html--> / <!--app-state--> placeholders
  vite.config.ts
  vitest.config.ts                  # plugin-react (TSX in tests) + node env
  tsconfig.json / tsconfig.app.json / tsconfig.node.json   # self-contained (no @vanya2h configs)
  server/
    index.ts                        # Hono + vite middleware/static + WS injection
    db.ts                           # PGlite singleton, DDL + seed
    live.ts                         # hub + createServer + keyer
    api.ts                          # GET /todos (data+grants), POST /todos, PATCH /todos/:id
    ws.ts                           # Hono upgradeWebSocket -> createWsServer bridge
    render.ts                       # template load + <!--app-html-->/<!--app-state--> replace
    live.smoke.test.ts              # create->stale, update->patch
  src/
    db/schema.ts                    # todos table
    todos.ts                        # todoModel + todosState (no react imports — server-safe)
    resources.ts                    # defineResource + registry (rxfy-server/browser)
    api-client.ts                   # hono client; isServer branch reads db directly
    live-singleton.ts
    routes.ts                       # routeStates(pathname) for SSR grants
    App.tsx                         # <Routes> + nav links
    pages/TodosPage.tsx             # list + create form + updates badge + toggle
    pages/AboutPage.tsx             # proves non-root SSR route
    entry-client.tsx                # hydrateRoot + BrowserRouter + live client
    entry-server.tsx                # renderToPipeableStream + StaticRouter + grants
    ssr.smoke.test.ts               # SSR compliance: data in HTML, hydration payload, /about
    styles.css
    vite-env.d.ts

packages/create-rxfy-app/           # new published package
  package.json                      # bin, files: ["dist"], deps @clack/prompts + picocolors
  tsconfig.json                     # extends @vanya2h/typescript-config/node
  tsup.config.ts                    # ESM, entry src/index.ts
  eslint.config.ts                  # copied from packages/rxfy-ws
  vitest.config.ts
  src/index.ts                      # CLI entry (#!/usr/bin/env node)
  src/scaffold.ts                   # listTemplates() + scaffold()
  src/scaffold.test.ts
  src/prepare.ts                    # rewriteWorkspaceDeps() (shared with build script)
  src/prepare.test.ts
  scripts/prepare-templates.ts      # build step: copy templates -> dist/templates + rewrite

apps/docs/src/pages/getting-started/framework.mdx   # modify: scaffold section
apps/docs/src/pages/examples.mdx                    # modify: monorepo-only note
```

---

### Task 1: Workspace plumbing

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `.changeset/config.json`

- [ ] **Step 1: Add `templates/*` to the workspace**

In `pnpm-workspace.yaml`, change the packages list to:

```yaml
packages:
  - packages/*
  - examples/*
  - apps/*
  - templates/*
```

(Leave `onlyBuiltDependencies` and `patchedDependencies` untouched.)

- [ ] **Step 2: Ignore templates in changesets**

In `.changeset/config.json`, change the ignore line to:

```json
  "ignore": ["docs", "rxfy-example-*", "rxfy-template-*"],
```

- [ ] **Step 3: Commit**

```bash
git add pnpm-workspace.yaml .changeset/config.json
git commit -m "chore: add templates/* workspace glob and changeset ignore"
```

---

### Task 2: templates/vite — project shell

**Files:**

- Create: `templates/vite/template.json`, `templates/vite/package.json`, `templates/vite/.gitignore`, `templates/vite/index.html`, `templates/vite/vite.config.ts`, `templates/vite/vitest.config.ts`, `templates/vite/tsconfig.json`, `templates/vite/tsconfig.app.json`, `templates/vite/tsconfig.node.json`, `templates/vite/src/styles.css`, `templates/vite/src/vite-env.d.ts`, `templates/vite/README.md`

- [ ] **Step 1: `templates/vite/template.json`**

```json
{
  "display": "Vite + Hono (live SSR app)",
  "description": "Full live stack: Vite SSR, React Router, Hono, Drizzle + PGlite, real-time updates over WebSocket"
}
```

- [ ] **Step 2: `templates/vite/package.json`**

`rxfy-template-vite` is the workspace name; the CLI rewrites `name` on scaffold and the bundler rewrites `workspace:*` at build time.

```json
{
  "name": "rxfy-template-vite",
  "version": "0.0.0",
  "private": true,
  "description": "rxfy live app: Vite SSR + React Router + Hono + Drizzle/PGlite + real-time updates",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build --outDir dist/client",
    "build:server": "vite build --ssr src/entry-server.tsx --outDir dist/server",
    "check-types": "tsc -b --noEmit",
    "clean": "rimraf ./dist",
    "dev": "tsx ./server/index.ts",
    "preview": "cross-env NODE_ENV=production tsx ./server/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@electric-sql/pglite": "^0.5.3",
    "@hono/node-server": "^1.14.0",
    "@hono/node-ws": "^1.1.0",
    "drizzle-orm": "^0.45.2",
    "hono": "^4.7.0",
    "lodash": "^4.17.21",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-router": "^7.17.0",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxfy-server": "workspace:*",
    "rxfy-ws": "workspace:*",
    "rxjs": "^7.8.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^22.15.29",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.2.0",
    "cross-env": "^7.0.3",
    "rimraf": "^6.0.1",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.1.4"
  }
}
```

- [ ] **Step 3: `templates/vite/.gitignore`**

A real `.gitignore` in-repo (keeps the monorepo clean); the bundling step renames it to `_gitignore` and the CLI renames it back on scaffold.

```
node_modules
dist
*.tsbuildinfo
.env
```

- [ ] **Step 4: `templates/vite/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>rxfy live todos</title>
    <link rel="stylesheet" href="/src/styles.css" />
    <!--app-head-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <!--app-state-->
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: `templates/vite/vite.config.ts`**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 6: `templates/vite/vitest.config.ts`**

`plugin-react` is required: the SSR smoke test imports `entry-server.tsx`, and the plugin gives esbuild the automatic JSX runtime.

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environment: "node",
  },
});
```

- [ ] **Step 7: tsconfigs (self-contained — a scaffolded app must not depend on `@vanya2h/typescript-config`)**

`templates/vite/tsconfig.json`:

```json
{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }
```

`templates/vite/tsconfig.app.json`:

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
  "include": ["src"]
}
```

`templates/vite/tsconfig.node.json`:

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
  "include": ["server", "vite.config.ts", "vitest.config.ts"]
}
```

Note: `src/ssr.smoke.test.ts` lives in `src` (tsconfig.app), NOT `server` — it statically imports `entry-server.tsx`, which needs `jsx` + DOM libs that tsconfig.node lacks. Server files it pulls in type-check fine under tsconfig.app because `types` is unset there (all `@types/*`, including node, are visible).

- [ ] **Step 8: `templates/vite/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 9: `templates/vite/src/styles.css`**

```css
:root {
  color-scheme: light dark;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

body {
  margin: 0;
  display: flex;
  justify-content: center;
}

main {
  width: min(40rem, 100vw - 2rem);
  padding: 2rem 0 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

header a {
  color: inherit;
  text-decoration: none;
}

header a:first-child {
  font-size: 1.25rem;
  font-weight: 600;
}

form {
  display: flex;
  gap: 0.5rem;
}

form input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  font: inherit;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 0.375rem;
  background: transparent;
  color: inherit;
}

button {
  padding: 0.5rem 1rem;
  font: inherit;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 0.375rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.updates-badge {
  align-self: flex-start;
  font-size: 0.875rem;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

li label {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  cursor: pointer;
}

.done {
  text-decoration: line-through;
  opacity: 0.55;
}
```

- [ ] **Step 10: `templates/vite/README.md`**

````markdown
# rxfy live app

A fully server-side-rendered live app: [rxfy](https://rxfy.vanya2h.me) normalized stores on the client, a [Hono](https://hono.dev) server that owns writes through `rxfy-server`, and real-time updates pushed over WebSocket. The database is [PGlite](https://pglite.dev) (embedded Postgres) via [Drizzle](https://orm.drizzle.team) — zero setup, swap in a real Postgres when ready.

## Try it

```bash
pnpm install
pnpm dev
```
````

Open http://localhost:3000 in **two tabs**. Toggling a todo in one tab updates the other instantly (a live `patch`); adding a todo shows a "1 new — refresh" badge in the other tab (a `stale` invalidation — lists never mutate themselves).

## Scripts

| Script             | What it does                                         |
| ------------------ | ---------------------------------------------------- |
| `pnpm dev`         | Dev server (Vite middleware mode + SSR) on port 3000 |
| `pnpm build`       | Client + SSR production bundles into `dist/`         |
| `pnpm preview`     | Run the production build                             |
| `pnpm test`        | Live-write + SSR smoke tests                         |
| `pnpm check-types` | Typecheck client and server projects                 |

## Where things live

- `src/todos.ts` — the model + state (shared by server and client)
- `src/db/schema.ts` / `src/resources.ts` — Drizzle table bound to the model
- `server/api.ts` — reads return `{ data, grants }`; writes go through `live.create/update`
- `src/pages/TodosPage.tsx` — `useStateData`, entity subscription, updates badge
- `src/entry-server.tsx` / `src/entry-client.tsx` — SSR dehydrate → hydrate loop

Docs: https://rxfy.vanya2h.me/getting-started/framework

````

- [ ] **Step 11: Install and commit**

```bash
pnpm install
git add templates/vite pnpm-lock.yaml
git commit -m "feat(templates): add vite template shell (config, html, styles)"
````

Expected: install succeeds; `templates/vite` appears as workspace package `rxfy-template-vite`.

---

### Task 3: templates/vite — data layer

**Files:**

- Create: `templates/vite/src/db/schema.ts`, `templates/vite/src/todos.ts`, `templates/vite/src/resources.ts`, `templates/vite/src/live-singleton.ts`, `templates/vite/src/api-client.ts`, `templates/vite/server/db.ts`

- [ ] **Step 1: `templates/vite/src/db/schema.ts`**

```ts
import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const todos = pgTable("todos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: `templates/vite/src/todos.ts`**

IMPORTANT: no react/rxfy-react imports here — this module is imported by server code and must stay server-safe.

```ts
import { array, createModel, defineState } from "rxfy";
import { z } from "zod";

const TodoSchema = z.object({
  id: z.string(),
  title: z.string(),
  done: z.boolean(),
});

export type Todo = z.infer<typeof TodoSchema>;

/** `name` is required for SSR dehydration and doubles as the live topic namespace ("todo:<id>"). */
export const todoModel = createModel({ schema: TodoSchema, getKey: (t) => t.id, name: "todo" });

/** `key` is required for SSR query-cache dehydration. */
export const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: {
    todos: array(todoModel),
  },
});
```

- [ ] **Step 3: `templates/vite/src/resources.ts`**

```ts
import { createResourceRegistry, defineResource } from "rxfy-server/browser";
import { todos } from "./db/schema.js";
import { todoModel } from "./todos.js";

export const todoResource = defineResource({ table: todos, model: todoModel });

export const resources = createResourceRegistry([todoResource]);
```

- [ ] **Step 4: `templates/vite/src/live-singleton.ts`**

```ts
import type { LiveClient } from "rxfy-react";

let client: LiveClient | undefined;

export const setLiveClient = (c: LiveClient): void => {
  client = c;
};

export const getLiveClient = (): LiveClient | undefined => client;
```

- [ ] **Step 5: `templates/vite/server/db.ts`**

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { todos } from "../src/db/schema.js";

const globalForPglite = globalThis as unknown as { __rxfyPglite?: PGlite };
const client = (globalForPglite.__rxfyPglite ??= new PGlite());
export const db = drizzle(client);

const DDL = `
  CREATE TABLE todos (
    id text PRIMARY KEY,
    title text NOT NULL,
    done boolean NOT NULL DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  );
`;

let ready: Promise<void> | undefined;

/** Create tables + seed once. Idempotent (awaited by the server before handling requests). */
export function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await client.exec(DDL);
      await db.insert(todos).values([
        { id: "t1", title: "Open this app in a second tab", done: false },
        { id: "t2", title: "Toggle me — the other tab updates instantly", done: false },
        { id: "t3", title: "Add a todo — the other tab shows a refresh badge", done: false },
      ]);
    })();
  }
  return ready;
}

export { todos };
```

- [ ] **Step 6: `templates/vite/src/api-client.ts`**

On the server, `useStateData`'s fetch runs in the same process — read the database directly instead of calling our own HTTP API. On the client, reads also return `grants` so live subscriptions cover late-fetched data.

```ts
import { hc } from "hono/client";
import type { AppType } from "../server/api.js";
import { getLiveClient } from "./live-singleton.js";
import type { Todo } from "./todos.js";

const isServer = typeof window === "undefined";
const client = hc<AppType>("/api");

type Grants = { entities: Record<string, string>; channels: Record<string, string> };

export async function fetchTodos(): Promise<{ todos: Todo[] }> {
  if (isServer) {
    const { asc } = await import("drizzle-orm");
    const { db, todos } = await import("../server/db.js");
    const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
    return { todos: rows };
  }
  const res = await client.todos.$get();
  const body = (await res.json()) as unknown as { data: { todos: Todo[] }; grants: Grants };
  getLiveClient()?.addGrants(body.grants);
  return body.data;
}

export const createTodo = (title: string) => client.todos.$post({ json: { title } });

export const toggleTodo = (id: string, done: boolean) => client.todos[":id"].$patch({ param: { id }, json: { done } });
```

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm --filter rxfy-template-vite check-types
```

Expected: FAIL — `../server/api.js` does not exist yet. That is the next task; commit anyway (the data layer itself is complete):

```bash
git add templates/vite/src templates/vite/server/db.ts
git commit -m "feat(templates): vite template data layer (schema, model, state, resources)"
```

---

### Task 4: templates/vite — server

**Files:**

- Create: `templates/vite/server/live.ts`, `templates/vite/server/api.ts`, `templates/vite/server/ws.ts`, `templates/vite/server/render.ts`, `templates/vite/server/index.ts`

- [ ] **Step 1: `templates/vite/server/live.ts`**

```ts
import { createInMemoryHub, createServer, createTopicKeyer } from "rxfy-server";
import { resources } from "../src/resources.js";
import { db } from "./db.js";

export const hub = createInMemoryHub();

export const live = createServer({
  db,
  resources,
  hub,
  keyer: createTopicKeyer({ secret: process.env.RXFY_SECRET ?? "dev-secret", windowMs: 10 * 60_000 }),
});
```

- [ ] **Step 2: `templates/vite/server/api.ts`**

```ts
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { createModelRegistry, normalizeResult } from "rxfy";
import { type Resource, type StateChannelDescriptor, touch } from "rxfy-server";
import { todoResource } from "../src/resources.js";
import { todosState } from "../src/todos.js";
import { db, todos } from "./db.js";
import { live } from "./live.js";

// StateDescriptor.key is `string | undefined` in rxfy but StateChannelDescriptor requires `string`;
// todosState supplies a key, so the cast is safe.
const todosChannel = todosState as unknown as StateChannelDescriptor;

// live.create/update accept Resource<TTable> with the table's raw row shape; the model omits
// `createdAt`, so re-view the resource as its raw-row writer resource.
const todoWriteResource = todoResource as unknown as Resource<typeof todos>;

const newId = () => crypto.randomUUID();

export const api = new Hono()
  .get("/todos", async (c) => {
    const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
    const data = { todos: rows };
    const registry = createModelRegistry();
    normalizeResult(registry, todosState.fields, data);
    const grants = live.grant(registry, {
      entities: [todoResource],
      states: [{ state: todosChannel, params: {} }],
    });
    return c.json({ data, grants });
  })
  .post(
    "/todos",
    validator("json", (v) => v as { title: string }),
    async (c) => {
      const { title } = c.req.valid("json");
      const row = await live.create(
        todoWriteResource,
        { id: newId(), title, done: false },
        { touch: [touch(todosChannel, {})] },
      );
      return c.json(row);
    },
  )
  .patch(
    "/todos/:id",
    validator("json", (v) => v as { done: boolean }),
    async (c) => {
      const { done } = c.req.valid("json");
      const row = await live.update(todoWriteResource, c.req.param("id"), { done });
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json(row);
    },
  );

export type AppType = typeof api;
```

- [ ] **Step 3: `templates/vite/server/ws.ts`**

```ts
import { EventEmitter } from "node:events";
import type { UpgradeWebSocket } from "hono/ws";
import { createWsServer } from "rxfy-ws";
import { hub } from "./live.js";

const wsServer = createWsServer(hub);

/** Register the `/live` WebSocket handler using a Hono app's upgradeWebSocket helper. */
export function liveRoute(upgradeWebSocket: UpgradeWebSocket) {
  return upgradeWebSocket(() => {
    const emitter = new EventEmitter();
    return {
      onOpen(_evt: Event, ws: { send: (data: string) => void }) {
        wsServer.handleConnection({
          send: (data: string) => ws.send(data),
          on: (event, cb) => emitter.on(event, cb),
        });
      },
      onMessage(evt: MessageEvent) {
        emitter.emit("message", evt.data);
      },
      onClose() {
        emitter.emit("close");
      },
    };
  });
}
```

- [ ] **Step 4: `templates/vite/server/render.ts`**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ViteDevServer } from "vite";

type RenderFn = (url: string) => Promise<{ html: string; state: string }>;

export async function renderPage(url: string, vite: ViteDevServer | undefined, isProduction: boolean): Promise<string> {
  let template: string;
  let render: RenderFn;
  if (!isProduction) {
    template = await fs.readFile("./index.html", "utf-8");
    template = await vite!.transformIndexHtml(url, template);
    render = (await vite!.ssrLoadModule("/src/entry-server.tsx")).render as RenderFn;
  } else {
    template = await fs.readFile("./dist/client/index.html", "utf-8");
    const entryUrl = pathToFileURL(path.resolve(process.cwd(), "dist/server/entry-server.js")).href;
    render = ((await import(entryUrl)) as { render: RenderFn }).render;
  }
  const rendered = await render(url);
  return template.replace("<!--app-html-->", rendered.html).replace("<!--app-state-->", rendered.state);
}
```

- [ ] **Step 5: `templates/vite/server/index.ts`**

```ts
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
```

- [ ] **Step 6: Typecheck (client project will still fail — entries missing) and commit**

```bash
pnpm --filter rxfy-template-vite check-types
```

Expected: tsconfig.node project passes; tsconfig.app fails only on missing `entry-*`/`App` files (next task).

```bash
git add templates/vite/server
git commit -m "feat(templates): vite template server (hono, live writes, ws, ssr render)"
```

---

### Task 5: templates/vite — UI, routing, entries

**Files:**

- Create: `templates/vite/src/routes.ts`, `templates/vite/src/App.tsx`, `templates/vite/src/pages/TodosPage.tsx`, `templates/vite/src/pages/AboutPage.tsx`, `templates/vite/src/entry-client.tsx`, `templates/vite/src/entry-server.tsx`

- [ ] **Step 1: `templates/vite/src/routes.ts`**

```ts
import type { StateChannelDescriptor } from "rxfy-server";
import { todosState } from "./todos.js";

/** The state instances a pathname renders — used to mint live-grant channels during SSR. */
export function routeStates(
  pathname: string,
): Array<{ state: StateChannelDescriptor; params: Record<string, unknown> }> {
  if (pathname === "/") return [{ state: todosState as unknown as StateChannelDescriptor, params: {} }];
  return [];
}
```

- [ ] **Step 2: `templates/vite/src/App.tsx`**

```tsx
import { Link, Route, Routes } from "react-router";
import { AboutPage } from "./pages/AboutPage.js";
import { TodosPage } from "./pages/TodosPage.js";

export function App() {
  return (
    <main>
      <header>
        <Link to="/">rxfy live todos</Link>
        <Link to="/about">About</Link>
      </header>
      <Routes>
        <Route path="/" element={<TodosPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<p>Not found.</p>} />
      </Routes>
    </main>
  );
}
```

- [ ] **Step 3: `templates/vite/src/pages/TodosPage.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Pending, useModelStore, useObservable, useStateData } from "rxfy-react";
import { createTodo, fetchTodos, toggleTodo } from "../api-client.js";
import { todoModel, todosState } from "../todos.js";

function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  const todo$ = useMemo(() => store.get(id), [store, id]);
  return (
    <Pending value$={todo$}>
      {(todo) => (
        <li>
          <label>
            <input type="checkbox" checked={todo.done} onChange={() => void toggleTodo(todo.id, !todo.done)} />
            <span className={todo.done ? "done" : ""}>{todo.title}</span>
          </label>
        </li>
      )}
    </Pending>
  );
}

export function TodosPage() {
  const { data$, updatesAvailable$, applyUpdates } = useStateData({
    state: todosState,
    fetchFn: fetchTodos,
    params: {},
  });
  const updates = useObservable(updatesAvailable$, 0);
  const [title, setTitle] = useState("");

  return (
    <section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          setTitle("");
          void createTodo(next).then(() => applyUpdates());
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
        <button type="submit">Add</button>
      </form>
      {updates > 0 && (
        <button className="updates-badge" onClick={applyUpdates}>
          {updates} new — refresh
        </button>
      )}
      <Pending value$={data$} pending={<p>Loading…</p>} rejected={(w) => <p>Failed: {String(w.error)}</p>}>
        {({ todos }) => (
          <ul>
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )}
      </Pending>
    </section>
  );
}
```

- [ ] **Step 4: `templates/vite/src/pages/AboutPage.tsx`**

```tsx
export function AboutPage() {
  return (
    <section>
      <h1>About this template</h1>
      <p>
        This page exists to prove direct-URL server rendering: load <code>/about</code> with JavaScript disabled and the
        content is already in the HTML.
      </p>
      <p>
        The stack: Vite SSR, React Router, Hono, Drizzle on PGlite, and rxfy for normalized client state with live
        server-pushed updates.
      </p>
    </section>
  );
}
```

- [ ] **Step 5: `templates/vite/src/entry-server.tsx`**

```tsx
import { PassThrough } from "node:stream";
import { StrictMode, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import { live } from "../server/live.js";
import { App } from "./App.js";
import { todoResource } from "./resources.js";
import { routeStates } from "./routes.js";

export function render(url: string): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry();
  const pathname = new URL(url, "http://localhost").pathname;

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <Suspense fallback={null}>
            <StaticRouter location={url}>
              <App />
            </StaticRouter>
          </Suspense>
        </StoreProvider>
      </StrictMode>,
      {
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => {
            // Grants must be minted AFTER the render: only entities/channels actually
            // fetched into the registry are grantable.
            const grants = live.grant(registry, {
              entities: [todoResource],
              states: routeStates(pathname),
            });
            resolve({ html, state: hydrationScript({ ...dehydrate(registry), grants }) });
          });
          pipe(sink);
        },
        onError: (error) => reject(error instanceof Error ? error : new Error(String(error))),
      },
    );
  });
}
```

- [ ] **Step 6: `templates/vite/src/entry-client.tsx`**

```tsx
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { createModelRegistry } from "rxfy";
import { createLiveClient, readSsrGrants, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { App } from "./App.js";
import { setLiveClient } from "./live-singleton.js";

const registry = createModelRegistry();
const liveClient = createLiveClient({
  registry,
  transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
  grants: readSsrGrants(),
});
setLiveClient(liveClient);

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider registry={registry} ssr liveClient={liveClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StoreProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: Typecheck and build**

```bash
pnpm --filter rxfy-template-vite check-types
pnpm --filter rxfy-template-vite build
```

Expected: both PASS (`dist/client` + `dist/server` produced).

- [ ] **Step 8: Commit**

```bash
git add templates/vite/src
git commit -m "feat(templates): vite template UI, react-router routing, SSR entries"
```

---

### Task 6: templates/vite — smoke tests + manual verification

**Files:**

- Create: `templates/vite/server/live.smoke.test.ts`
- Create: `templates/vite/src/ssr.smoke.test.ts`

- [ ] **Step 1: Write `templates/vite/server/live.smoke.test.ts`**

```ts
import type { PublishSink, Resource, StateChannelDescriptor } from "rxfy-server";
import { createInMemoryHub, createServer, createTopicKeyer, touch } from "rxfy-server";
import { describe, expect, it } from "vitest";
import { resources, todoResource } from "../src/resources.js";
import { todosState } from "../src/todos.js";
import type { todos } from "./db.js";

const todoWriteResource = todoResource as unknown as Resource<typeof todos>;
const todosChannel = todosState as unknown as StateChannelDescriptor;

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

// Generous timeouts: each test cold-starts a PGlite (wasm Postgres) instance, which is
// fast locally (~1s) but several times slower on CI runners.
describe("live server", () => {
  it("registers the todo resource", () => {
    expect(resources.byName("todo")).toBe(todoResource);
  });

  it("create persists and touches the todos channel with a bare stale", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const keyer = createTopicKeyer({ secret: "t", windowMs: 60_000, now: () => 0 });
    const live = createServer({ db, resources, hub, keyer });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe("client", [keyer.current("todos")]);

    const row = await live.create(
      todoWriteResource,
      { id: "t1", title: "Hi", done: false },
      { touch: [touch(todosChannel, {})] },
    );
    expect(row).toMatchObject({ id: "t1", title: "Hi" });
    expect(received).toEqual([{ v: 1, kind: "stale", channel: "todos" }]);
  }, 30_000);

  it("update broadcasts a patch on the entity topic", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const keyer = createTopicKeyer({ secret: "t", windowMs: 60_000, now: () => 0 });
    const live = createServer({ db, resources, hub, keyer });
    await live.create(todoWriteResource, { id: "t1", title: "Hi", done: false });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe("client", [keyer.current("todo:t1")]);

    const row = await live.update(todoWriteResource, "t1", { done: true });
    expect(row).toMatchObject({ id: "t1", done: true });
    expect(received).toEqual([
      {
        v: 1,
        kind: "patch",
        name: "todo",
        id: "t1",
        data: { id: "t1", title: "Hi", done: true, createdAt: expect.any(Date) },
      },
    ]);
  }, 30_000);
});
```

- [ ] **Step 2: Write `templates/vite/src/ssr.smoke.test.ts`**

This is the spec's SSR-compliance gate: seeded data in the first-paint HTML, a hydration payload with grants, and a non-root route rendering on direct navigation.

```ts
import { describe, expect, it } from "vitest";
import { initDb } from "../server/db.js";
import { render } from "./entry-server.js";

describe("SSR", () => {
  it("renders the todos page with data resolved and a hydration payload", async () => {
    await initDb();
    const { html, state } = await render("/");
    // Seeded todo is in the first-paint HTML — no PENDING flash.
    expect(html).toContain("Open this app in a second tab");
    expect(html).not.toContain("Loading…");
    // Hydration payload + live grants ride along in <!--app-state-->.
    expect(state).toContain("__RXFY_SSR__");
    expect(state).toContain("grants");
  }, 30_000);

  it("server-renders a non-root route on direct navigation", async () => {
    await initDb();
    const { html } = await render("/about");
    expect(html).toContain("About this template");
  }, 30_000);
});
```

- [ ] **Step 3: Run the tests, expect PASS**

```bash
pnpm --filter rxfy-template-vite test
```

Expected: 5 tests pass across 2 files. If the SSR test's `__RXFY_SSR__` assertion fails, inspect the actual `state` string and adjust the assertion to the real hydrationScript marker — the data + grants assertions are the non-negotiable part.

- [ ] **Step 4: Manual two-tab live verification**

```bash
pnpm --filter rxfy-template-vite dev
```

Open http://localhost:3000 in two tabs and verify:

1. First paint shows the three seeded todos (view-source contains them — SSR, not client fetch).
2. Toggling a checkbox in tab A updates tab B instantly (patch flow).
3. Adding a todo in tab A shows "1 new — refresh" in tab B; clicking it reveals the todo (stale flow).
4. http://localhost:3000/about direct-loads with content (non-root SSR).
   Stop the server afterwards.

- [ ] **Step 5: Full turbo pass over the template, then commit**

```bash
turbo build test check-types --filter=rxfy-template-vite
git add templates/vite
git commit -m "feat(templates): vite template live + SSR smoke tests"
```

---

### Task 7: create-rxfy-app — package shell + scaffold logic (TDD)

**Files:**

- Create: `packages/create-rxfy-app/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `eslint.config.ts`
- Create: `packages/create-rxfy-app/src/scaffold.ts`, `src/scaffold.test.ts`

- [ ] **Step 1: `packages/create-rxfy-app/package.json`**

`rxfy-template-vite` is a devDependency on purpose: it puts the template into turbo's task graph so editing `templates/vite` invalidates this package's build cache.

```json
{
  "name": "create-rxfy-app",
  "version": "0.0.0",
  "description": "Scaffold a standalone rxfy app from an official template",
  "homepage": "https://rxfy.vanya2h.me",
  "bugs": {
    "url": "https://github.com/vanya2h/rxfy/issues"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/vanya2h/rxfy.git",
    "directory": "packages/create-rxfy-app"
  },
  "license": "MIT",
  "author": "hi@vanya2h.me",
  "type": "module",
  "bin": {
    "create-rxfy-app": "./dist/index.js"
  },
  "files": ["dist", "package.json", "README.md"],
  "scripts": {
    "build": "tsup && tsx ./scripts/prepare-templates.ts",
    "check-types": "tsc --noEmit",
    "clean": "rimraf ./dist",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "prepublishOnly": "pnpm run build",
    "test": "vitest run"
  },
  "dependencies": {
    "@clack/prompts": "^0.11.0",
    "picocolors": "^1.1.1"
  },
  "devDependencies": {
    "@types/node": "^22.15.29",
    "@vanya2h/eslint-config": "^0.7.0",
    "@vanya2h/typescript-config": "^0.7.0",
    "eslint": "^9.27.0",
    "jiti": "^2.4.2",
    "rimraf": "^6.0.1",
    "rxfy-template-vite": "workspace:*",
    "tsup": "^8.5.0",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4"
  },
  "engines": {
    "node": ">=20"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org"
  }
}
```

- [ ] **Step 2: config files**

`packages/create-rxfy-app/tsconfig.json`:

```json
{
  "extends": "@vanya2h/typescript-config/node",
  "compilerOptions": { "types": ["node", "vitest/globals"] },
  "exclude": ["node_modules", "dist", ".turbo"]
}
```

`packages/create-rxfy-app/tsup.config.ts` (no `clean` — `dist/templates` is written by the second build step, and tsup's clean only runs before tsup itself, so ordering is safe; still, keep it explicit):

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  clean: true,
});
```

`packages/create-rxfy-app/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

`eslint.config.ts`: copy from the sibling package (verify it contains nothing rxfy-ws-specific after copying):

```bash
cp packages/rxfy-ws/eslint.config.ts packages/create-rxfy-app/eslint.config.ts
```

- [ ] **Step 3: Install**

```bash
pnpm install
```

- [ ] **Step 4: Write the failing test `packages/create-rxfy-app/src/scaffold.test.ts`**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listTemplates, scaffold } from "./scaffold.js";

let tmp: string;

/** Build a fake bundled templates root with one template in it. */
function fixtureTemplatesRoot(): string {
  const root = path.join(tmp, "templates");
  const dir = path.join(root, "vite");
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "template.json"),
    JSON.stringify({ display: "Vite (live SSR app)", description: "Full live stack" }),
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "rxfy-template-vite", private: true, dependencies: { rxfy: "^2.0.0" } }, null, 2),
  );
  fs.writeFileSync(path.join(dir, "_gitignore"), "node_modules\ndist\n");
  fs.writeFileSync(path.join(dir, "src", "main.ts"), "export {};\n");
  // Junk that must never be copied into a scaffolded app:
  fs.mkdirSync(path.join(dir, "node_modules", "junk"), { recursive: true });
  fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
  fs.writeFileSync(path.join(dir, "tsconfig.app.tsbuildinfo"), "{}");
  return root;
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "create-rxfy-app-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("listTemplates", () => {
  it("reads template.json metadata keyed by directory name", () => {
    const templates = listTemplates(fixtureTemplatesRoot());
    expect(templates).toEqual([{ name: "vite", display: "Vite (live SSR app)", description: "Full live stack" }]);
  });
});

describe("scaffold", () => {
  it("copies files, renames _gitignore, rewrites the package name, drops junk", () => {
    const root = fixtureTemplatesRoot();
    const target = path.join(tmp, "my-app");

    scaffold({ templateDir: path.join(root, "vite"), targetDir: target, projectName: "my-app" });

    expect(fs.readFileSync(path.join(target, "src", "main.ts"), "utf8")).toBe("export {};\n");
    expect(fs.existsSync(path.join(target, ".gitignore"))).toBe(true);
    expect(fs.existsSync(path.join(target, "_gitignore"))).toBe(false);
    expect(fs.existsSync(path.join(target, "template.json"))).toBe(false);
    expect(fs.existsSync(path.join(target, "node_modules"))).toBe(false);
    expect(fs.existsSync(path.join(target, "dist"))).toBe(false);
    expect(fs.existsSync(path.join(target, "tsconfig.app.tsbuildinfo"))).toBe(false);

    const pkg = JSON.parse(fs.readFileSync(path.join(target, "package.json"), "utf8"));
    expect(pkg.name).toBe("my-app");
    expect(pkg.dependencies).toEqual({ rxfy: "^2.0.0" });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

```bash
pnpm --filter create-rxfy-app test
```

Expected: FAIL — cannot resolve `./scaffold.js`.

- [ ] **Step 6: Implement `packages/create-rxfy-app/src/scaffold.ts`**

```ts
import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo"]);

export type TemplateMeta = { name: string; display: string; description: string };

/** Read every bundled template's `template.json`, keyed by directory name. */
export function listTemplates(templatesRoot: string): TemplateMeta[] {
  return fs
    .readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(templatesRoot, entry.name, "template.json")))
    .map((entry) => {
      const meta = JSON.parse(fs.readFileSync(path.join(templatesRoot, entry.name, "template.json"), "utf8")) as Omit<
        TemplateMeta,
        "name"
      >;
      return { name: entry.name, ...meta };
    });
}

export function scaffold(options: { templateDir: string; targetDir: string; projectName: string }): void {
  const { templateDir, targetDir, projectName } = options;

  fs.cpSync(templateDir, targetDir, {
    recursive: true,
    filter: (src) => !SKIP_DIRS.has(path.basename(src)) && !src.endsWith(".tsbuildinfo"),
  });
  fs.rmSync(path.join(targetDir, "template.json"), { force: true });

  const gitignore = path.join(targetDir, "_gitignore");
  if (fs.existsSync(gitignore)) fs.renameSync(gitignore, path.join(targetDir, ".gitignore"));

  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  pkg.name = projectName;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm --filter create-rxfy-app test
```

Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add packages/create-rxfy-app pnpm-lock.yaml
git commit -m "feat(create-rxfy-app): package shell and scaffold logic"
```

---

### Task 8: create-rxfy-app — template bundling build step (TDD)

**Files:**

- Create: `packages/create-rxfy-app/src/prepare.ts`, `src/prepare.test.ts`, `scripts/prepare-templates.ts`

- [ ] **Step 1: Write the failing test `packages/create-rxfy-app/src/prepare.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { rewriteWorkspaceDeps } from "./prepare.js";

const versions = { rxfy: "2.0.0", "rxfy-react": "2.0.0", "rxfy-server": "2.0.0", "rxfy-ws": "2.0.0" };

describe("rewriteWorkspaceDeps", () => {
  it("rewrites workspace:* ranges to caret ranges of the published version", () => {
    const pkg = {
      name: "rxfy-template-vite",
      dependencies: { rxfy: "workspace:*", react: "^19.2.7" },
      devDependencies: { "rxfy-ws": "workspace:*", vite: "^6.3.5" },
    };
    const out = rewriteWorkspaceDeps(pkg, versions);
    expect(out.dependencies).toEqual({ rxfy: "^2.0.0", react: "^19.2.7" });
    expect(out.devDependencies).toEqual({ "rxfy-ws": "^2.0.0", vite: "^6.3.5" });
  });

  it("does not mutate the input", () => {
    const pkg = { dependencies: { rxfy: "workspace:*" } };
    rewriteWorkspaceDeps(pkg, versions);
    expect(pkg.dependencies.rxfy).toBe("workspace:*");
  });

  it("throws when a workspace dependency has no known published version", () => {
    const pkg = { dependencies: { "rxfy-unknown": "workspace:*" } };
    expect(() => rewriteWorkspaceDeps(pkg, versions)).toThrow(/rxfy-unknown/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter create-rxfy-app test
```

Expected: FAIL — cannot resolve `./prepare.js`.

- [ ] **Step 3: Implement `packages/create-rxfy-app/src/prepare.ts`**

```ts
type PackageJson = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * Replace every `workspace:*` range with `^<published version>` so a scaffolded app
 * installs the rxfy release this CLI build was cut against.
 */
export function rewriteWorkspaceDeps(pkg: PackageJson, versions: Record<string, string>): PackageJson {
  const out = structuredClone(pkg);
  for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const deps = out[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (!range.startsWith("workspace:")) continue;
      const version = versions[name];
      if (!version) throw new Error(`No published version known for workspace dependency "${name}"`);
      deps[name] = `^${version}`;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter create-rxfy-app test
```

Expected: PASS (6 tests).

- [ ] **Step 5: Write `packages/create-rxfy-app/scripts/prepare-templates.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteWorkspaceDeps } from "../src/prepare.js";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pkgRoot, "../..");
const templatesSrc = path.join(repoRoot, "templates");
const templatesOut = path.join(pkgRoot, "dist", "templates");

const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo"]);

const versions: Record<string, string> = {};
for (const dir of fs.readdirSync(path.join(repoRoot, "packages"))) {
  const pkgJsonPath = path.join(repoRoot, "packages", dir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as { name: string; version: string };
  versions[pkg.name] = pkg.version;
}

fs.rmSync(templatesOut, { recursive: true, force: true });

for (const entry of fs.readdirSync(templatesSrc, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const src = path.join(templatesSrc, entry.name);
  const out = path.join(templatesOut, entry.name);

  fs.cpSync(src, out, {
    recursive: true,
    filter: (p) => !SKIP_DIRS.has(path.basename(p)) && !p.endsWith(".tsbuildinfo"),
  });

  // npm strips .gitignore files from published tarballs — ship as _gitignore,
  // the CLI renames it back on scaffold.
  const gitignore = path.join(out, ".gitignore");
  if (fs.existsSync(gitignore)) fs.renameSync(gitignore, path.join(out, "_gitignore"));

  const pkgJsonPath = path.join(out, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as Record<string, unknown>;
  fs.writeFileSync(pkgJsonPath, `${JSON.stringify(rewriteWorkspaceDeps(pkg, versions), null, 2)}\n`);

  console.log(`prepared template: ${entry.name}`);
}
```

- [ ] **Step 6: Run the build and inspect the bundle**

```bash
pnpm --filter create-rxfy-app build
cat packages/create-rxfy-app/dist/templates/vite/package.json | grep -A2 '"rxfy"'
ls packages/create-rxfy-app/dist/templates/vite/_gitignore
```

Expected: `"rxfy": "^2.0.0"` (current version — no `workspace:*` anywhere), `_gitignore` present, no `node_modules`/`dist` inside the bundled template.

- [ ] **Step 7: Commit**

```bash
git add packages/create-rxfy-app/src/prepare.ts packages/create-rxfy-app/src/prepare.test.ts packages/create-rxfy-app/scripts
git commit -m "feat(create-rxfy-app): bundle templates into dist with version rewriting"
```

---

### Task 9: create-rxfy-app — CLI entry

**Files:**

- Create: `packages/create-rxfy-app/src/index.ts`
- Create: `packages/create-rxfy-app/README.md`

- [ ] **Step 1: Implement `packages/create-rxfy-app/src/index.ts`**

```ts
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { listTemplates, scaffold } from "./scaffold.js";

// dist/index.js sits next to dist/templates (written by scripts/prepare-templates.ts).
const templatesRoot = fileURLToPath(new URL("./templates", import.meta.url));

const USAGE = `Usage: create-rxfy-app [project-name] [--template <name>]

Options:
  -t, --template <name>  Template to use (skips the picker)
  -h, --help             Show this message
`;

function bail(message: string): never {
  p.cancel(message);
  process.exit(1);
}

async function main(): Promise<void> {
  let values: { template?: string; help?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        template: { type: "string", short: "t" },
        help: { type: "boolean", short: "h" },
      },
      allowPositionals: true,
    }));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    console.error(USAGE);
    process.exit(1);
  }

  if (values.help) {
    console.log(USAGE);
    return;
  }

  p.intro(pc.cyan("create-rxfy-app"));

  const templates = listTemplates(templatesRoot);
  if (templates.length === 0) bail("No templates bundled with this build — this is a packaging bug, please report it.");

  let projectName = positionals[0];
  if (!projectName) {
    const answer = await p.text({
      message: "Project name",
      placeholder: "my-rxfy-app",
      defaultValue: "my-rxfy-app",
    });
    if (p.isCancel(answer)) bail("Cancelled.");
    projectName = answer;
  }

  const targetDir = path.resolve(process.cwd(), projectName);
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    bail(`Directory "${projectName}" already exists and is not empty.`);
  }

  let templateName = values.template;
  if (templateName && !templates.some((t) => t.name === templateName)) {
    p.log.warn(`Unknown template "${templateName}". Available: ${templates.map((t) => t.name).join(", ")}`);
    templateName = undefined;
  }
  if (!templateName) {
    if (templates.length === 1) {
      templateName = templates[0]!.name;
      p.log.info(`Using the ${pc.bold(templates[0]!.display)} template.`);
    } else {
      const answer = await p.select({
        message: "Template",
        options: templates.map((t) => ({ value: t.name, label: t.display, hint: t.description })),
      });
      if (p.isCancel(answer)) bail("Cancelled.");
      templateName = answer;
    }
  }

  scaffold({
    templateDir: path.join(templatesRoot, templateName),
    targetDir,
    projectName: path.basename(targetDir),
  });

  p.outro(
    [
      `Scaffolded ${pc.green(path.basename(targetDir))}. Next steps:`,
      "",
      pc.dim(`  cd ${path.relative(process.cwd(), targetDir) || "."}`),
      pc.dim("  pnpm install"),
      pc.dim("  pnpm dev"),
    ].join("\n"),
  );
}

await main();
```

- [ ] **Step 2: `packages/create-rxfy-app/README.md`**

````markdown
# create-rxfy-app

Scaffold a standalone [rxfy](https://rxfy.vanya2h.me) app from an official template.

```bash
pnpm create rxfy-app my-app
# or: npm create rxfy-app@latest my-app
# or: yarn create rxfy-app my-app
```
````

## Templates

| Name   | Stack                                                                              |
| ------ | ---------------------------------------------------------------------------------- |
| `vite` | Vite SSR + React Router + Hono + Drizzle/PGlite + rxfy live updates over WebSocket |

Pick non-interactively with `--template`:

```bash
pnpm create rxfy-app my-app --template vite
```

Templates are bundled with each release and pinned to the matching rxfy versions.

````

- [ ] **Step 3: Build and verify end to end against the real bundle**

```bash
pnpm --filter create-rxfy-app build
cd /tmp && rm -rf scaffold-check && node /Users/vanya2h/Repos/rxfy/packages/create-rxfy-app/dist/index.js scaffold-check --template vite
ls /tmp/scaffold-check
grep '"name"' /tmp/scaffold-check/package.json
grep '"rxfy"' /tmp/scaffold-check/package.json
ls /tmp/scaffold-check/.gitignore
cd /Users/vanya2h/Repos/rxfy
````

Expected: full template tree copied; `"name": "scaffold-check"`; `"rxfy": "^2.0.0"` (no workspace ranges); `.gitignore` present; no `template.json`. (Optional, needs network: `cd /tmp/scaffold-check && pnpm install && pnpm test` — this installs the published rxfy packages from npm.)

- [ ] **Step 4: Full package checks, then commit**

```bash
turbo build test check-types lint --filter=create-rxfy-app
git add packages/create-rxfy-app
git commit -m "feat(create-rxfy-app): interactive CLI entry"
```

---

### Task 10: Docs, changeset, final verification

**Files:**

- Modify: `apps/docs/src/pages/getting-started/framework.mdx`
- Modify: `apps/docs/src/pages/examples.mdx`
- Create: `.changeset/create-rxfy-app.md`

- [ ] **Step 1: Add the scaffold section to the framework quickstart**

In `apps/docs/src/pages/getting-started/framework.mdx`, insert directly before the `## Install` heading:

````mdx
## Scaffold a new app

The fastest start is the official scaffolder. It creates a standalone, fully server-rendered
live app — Vite SSR, React Router, a Hono server, Drizzle on embedded Postgres
([PGlite](https://pglite.dev)), and real-time todos wired end to end:

:::code-group

```bash [npm]
npm create rxfy-app@latest my-app
```
````

```bash [pnpm]
pnpm create rxfy-app my-app
```

```bash [yarn]
yarn create rxfy-app my-app
```

:::

Then:

```bash
cd my-app
pnpm install
pnpm dev
```

Open http://localhost:3000 in two tabs and toggle a todo — the other tab updates instantly.
Everything below explains what the scaffold wired up; read on to understand it or to add
the framework to an existing app by hand.

````

- [ ] **Step 2: Add the monorepo-only note to the examples page**

In `apps/docs/src/pages/examples.mdx`, insert directly after the intro paragraph ("Runnable example apps in the … arranged the way the docs teach rxfy…"):

```mdx
:::note
The examples are workspace apps — their `workspace:*` dependencies only resolve inside a
clone of the [rxfy repository](https://github.com/vanya2h/rxfy), and the `pnpm --filter … dev`
commands below run from its repo root. They will do nothing in your own project. To start a
standalone app, use [`pnpm create rxfy-app`](/getting-started/framework#scaffold-a-new-app).
:::
````

- [ ] **Step 3: Create `.changeset/create-rxfy-app.md`**

```markdown
---
"create-rxfy-app": minor
---

New package: `create-rxfy-app` — scaffold a standalone rxfy app from an official template
(`pnpm create rxfy-app`). Ships the `vite` template: a fully SSR'd live todos app (Vite +
React Router + Hono + Drizzle/PGlite + rxfy live updates over WebSocket).
```

- [ ] **Step 4: Docs build check**

```bash
turbo build --filter=docs
```

Expected: PASS.

- [ ] **Step 5: Full repo verification**

```bash
turbo build test check-types lint
```

Expected: all tasks PASS (pre-existing failures unrelated to this work are out of scope — note them if any).

- [ ] **Step 6: Commit**

```bash
git add apps/docs/src/pages/getting-started/framework.mdx apps/docs/src/pages/examples.mdx .changeset/create-rxfy-app.md
git commit -m "docs: lead framework quickstart with create-rxfy-app; note monorepo-only examples"
```

---

## Verification checklist (maps to spec requirements)

- Scaffold CLI: `pnpm create rxfy-app my-app --template vite` → Task 9 step 3
- Templates bundled + version-pinned atomically: Task 8 step 6
- Template CI-covered via workspace: Task 1 + Task 6 step 5
- SSR compliance (data in first-paint HTML, hydration payload + grants, non-root route): Task 6 step 2
- Live updates on first run (patch + stale flows, two tabs): Task 6 step 4
- React Router library-mode routing: Task 5 (StaticRouter server / BrowserRouter client)
- Docs lead with the scaffolder + examples caveat: Task 10
- Changeset (minor, new package): Task 10 step 3

```

```
