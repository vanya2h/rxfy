# vite-blog-framework Example Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `examples/vite-blog-framework` — a live blog (Hono + Vite SSR + PGlite + Drizzle) that demonstrates the rxfy live framework: post/comment edits apply live in place, and post/comment creates/deletes surface a non-intrusive "N new posts/comments" badge (the badge is `useStateData().updatesAvailable$`, the live apply is `createLiveClient`).

**Architecture:** One process: Hono owns the Node HTTP server; `@hono/node-ws` provides `/live`; REST `/api/*` endpoints call `createServer(...)`'s `live.update/create/delete`; the `rxfy-ws` `createWsServer(hub)` bridges to Hono's `upgradeWebSocket` via a per-connection EventEmitter shim; buffered Vite SSR mints `grants` into the hydration script. The browser holds one rxfy registry + one `createLiveClient` (over `rxfy-ws/client`); `useStateData` gives the live data + the badge for free.

**Tech Stack:** Hono 4, `@hono/node-server`, `@hono/node-ws`, Vite 6 (SSR), `@electric-sql/pglite`, drizzle-orm (pg-core), React 19, RxJS, Zod, and workspace `rxfy`/`rxfy-react`/`rxfy-server`/`rxfy-ws`. PGlite verified facts: `new PGlite()` in-memory, `drizzle(client)`, tables via `client.exec(CREATE TABLE …)` (snake_case columns), `.returning()`, timestamp→Date.

This is the example plan from `docs/superpowers/specs/2026-07-01-vite-blog-framework-design.md`. The framework packages (rxfy-protocol/server/ws + rxfy/rxfy-react live additions) are complete on branch `feat/rxfy-server-framework`. **Reference templates** (copy & adapt — do not import from them): `examples/vite-realtime-todos` (server/index.ts, entry-server.tsx, entry-client.tsx, vite.config.ts, tsconfig*.json, index.html, eslint.config.ts) and `examples/waku-blog` (component shapes, seed data).

---

## File Structure

```
examples/vite-blog-framework/
  package.json  tsconfig.json  tsconfig.app.json  tsconfig.node.json
  vite.config.ts  eslint.config.ts  index.html
  src/
    vite-env.d.ts
    styles.css
    db/schema.ts          # Drizzle pgTables (shared by client type-imports + server)
    blog/resources.ts     # defineResource + createResourceRegistry (shared, isomorphic)
    blog/states.ts        # defineState (shared)
    blog/types.ts         # InferSelectModel row types
    blog/api-client.ts    # client fetchers + mutation helpers (+ addGrants)
    live-singleton.ts     # module-level liveClient holder
    routes.ts             # url -> { state, params } map (shared by SSR grant + client router)
    App.tsx               # 2-route client router
    components/
      UpdatesBadge.tsx  PostList.tsx  PostItem.tsx  PostDetail.tsx
      CommentItem.tsx  NewPostForm.tsx  EditPostForm.tsx  AddCommentForm.tsx
    entry-client.tsx
    entry-server.tsx
  server/
    db.ts        # PGlite + drizzle + CREATE TABLE + seed
    live.ts      # createServer({ db, resources, hub, keyer })
    api.ts       # Hono REST routes -> live.*
    ws.ts        # createWsServer(hub) bridged to @hono/node-ws
    render.ts    # buffered SSR + dehydrate + grant
    index.ts     # Hono app + Node http server + vite + injectWebSocket
  server/live.smoke.test.ts
  README.md
```

---

## Task 1: Scaffold the package

**Files:** package.json, tsconfig.json, tsconfig.app.json, tsconfig.node.json, vite.config.ts, eslint.config.ts, index.html, src/vite-env.d.ts, src/styles.css.

- [ ] **Step 1: `examples/vite-blog-framework/package.json`**

```json
{
  "name": "vite-blog-framework",
  "version": "0.1.0",
  "private": true,
  "description": "Live blog example (Vite SSR + Hono + PGlite + the rxfy live framework)",
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
    "test": "vitest run --passWithNoTests",
    "lint": "eslint ."
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.5.3",
    "@hono/node-server": "^1.14.0",
    "@hono/node-ws": "^1.1.0",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vanya2h/eslint-config": "^0.4.0",
    "@vitejs/plugin-react": "^5.2.0",
    "cross-env": "^7.0.3",
    "drizzle-orm": "^0.45.2",
    "eslint": "^9.27.0",
    "hono": "^4.7.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "rimraf": "^6.0.1",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxfy-server": "workspace:*",
    "rxfy-ws": "workspace:*",
    "rxjs": "^7.8.2",
    "tsx": "^4.19.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.5",
    "vitest": "^3.1.4",
    "zod": "^4.4.3"
  }
}
```

- [ ] **Step 2: tsconfig files** — copy EXACTLY from `examples/vite-realtime-todos`:
  - `tsconfig.json`: `{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }`
  - `tsconfig.app.json` and `tsconfig.node.json`: copy byte-for-byte from `examples/vite-realtime-todos/tsconfig.app.json` / `tsconfig.node.json` (read them and reproduce). They use `moduleResolution: bundler`, `verbatimModuleSyntax`, `strict`, `noUnusedLocals/Parameters`. The app config `include`s `["src", "shared"]` — change to `["src"]`. The node config `include`s `["server", "shared", "vite.config.ts", "eslint.config.ts"]` — change to `["server", "vite.config.ts", "eslint.config.ts"]`.

- [ ] **Step 3: `vite.config.ts`**
```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 4: `eslint.config.ts`** (same as the todos example)
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

- [ ] **Step 5: `index.html`**
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>rxfy — live blog</title>
    <!--app-head-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <!--app-state-->
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: `src/vite-env.d.ts`** → `/// <reference types="vite/client" />`

- [ ] **Step 7: `src/styles.css`** — a small, clean stylesheet (≈80 lines): body font/max-width, `.post-list`, `.post-card`, `.badge-button` (a pill button), `.form` inputs, `.comment-list`, `.status`/`.error`. Keep it simple; mirror the tone of `examples/waku-blog`'s CSS. (No functional requirement — just legible.)

- [ ] **Step 8: install + verify scaffolding**
Run: `pnpm install` then `pnpm --filter vite-blog-framework check-types` (expect 0 errors — no source yet beyond env.d.ts) and `pnpm --filter vite-blog-framework lint` (clean).

- [ ] **Step 9: commit**
```bash
git add examples/vite-blog-framework pnpm-lock.yaml
git commit -m "chore(example): scaffold vite-blog-framework"
```

---

## Task 2: Database schema + server/db.ts (PGlite + seed)

**Files:** `src/db/schema.ts`, `src/blog/types.ts`, `server/db.ts`.

- [ ] **Step 1: `src/db/schema.ts`** — Drizzle pgTables (snake_case columns):
```ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: `src/blog/types.ts`** — row types from the tables:
```ts
import type { InferSelectModel } from "drizzle-orm";
import type { comments, posts, users } from "../db/schema.js";

export type User = InferSelectModel<typeof users>;
export type Post = InferSelectModel<typeof posts>;
export type Comment = InferSelectModel<typeof comments>;
```
> Use `.js` import specifiers (Vite/ESM). The schema file is imported by both server and client (client type-imports it; the table objects are isomorphic and pull no DB driver).

- [ ] **Step 3: `server/db.ts`** — PGlite + drizzle + DDL + seed:
```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { comments, posts, users } from "../src/db/schema.js";

const client = new PGlite(); // in-memory, fresh per process
export const db = drizzle(client);

const DDL = `
  CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL);
  CREATE TABLE posts (
    id text PRIMARY KEY, author_id text NOT NULL, title text NOT NULL,
    body text NOT NULL, created_at timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE comments (
    id text PRIMARY KEY, post_id text NOT NULL, author text NOT NULL,
    body text NOT NULL, created_at timestamp NOT NULL DEFAULT now()
  );
`;

let ready: Promise<void> | undefined;

/** Create tables + seed once. Idempotent (awaited by the server before handling requests). */
export function initDb(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await client.exec(DDL);
      await db.insert(users).values([
        { id: "u1", name: "Alice Doe", email: "alice@example.com" },
        { id: "u2", name: "Bob Smith", email: "bob@example.com" },
        { id: "u3", name: "Carol Lee", email: "carol@example.com" },
      ]);
      await db.insert(posts).values([
        { id: "p1", authorId: "u1", title: "Getting Started with rxfy", body: "rxfy is a stream-based, normalized state library built on RxJS…" },
        { id: "p2", authorId: "u2", title: "RxJS Patterns in 2025", body: "Reactive programming has evolved; clean operator chains and minimal subscriptions win…" },
        { id: "p3", authorId: "u3", title: "Zod for Runtime Type Safety", body: "TypeScript is compile-time; Zod fills the runtime gap with a chainable schema API…" },
      ]);
      await db.insert(comments).values([
        { id: "c1", postId: "p1", author: "Bob Smith", body: "Great intro!" },
        { id: "c2", postId: "p1", author: "Carol Lee", body: "Does it support derived state?" },
      ]);
    })();
  }
  return ready;
}

export { comments, posts, users };
```

- [ ] **Step 4: verify + commit**
Run: `pnpm --filter vite-blog-framework check-types` (0 errors). 
```bash
git add examples/vite-blog-framework/src/db examples/vite-blog-framework/src/blog/types.ts examples/vite-blog-framework/server/db.ts
git commit -m "feat(example): add Drizzle schema, row types, and PGlite db with seed"
```

---

## Task 3: Shared resources + states + routes

**Files:** `src/blog/resources.ts`, `src/blog/states.ts`, `src/routes.ts`.

- [ ] **Step 1: `src/blog/resources.ts`**
```ts
import { createResourceRegistry, defineResource } from "rxfy-server";
import { comments, posts, users } from "../db/schema.js";

export const userResource = defineResource({ table: users, name: "user" });
export const postResource = defineResource({ table: posts, name: "post" });
export const commentResource = defineResource({ table: comments, name: "comment" });

export const userModel = userResource.model;
export const postModel = postResource.model;
export const commentModel = commentResource.model;

export const resources = createResourceRegistry([userResource, postResource, commentResource]);
```
> `defineResource`/`createResourceRegistry` come from `rxfy-server` (its `.` entry, which is browser-safe — it imports drizzle-orm/drizzle-zod but no DB driver). The client imports this module to get `resources` for `createLiveClient` and the models for `useModelStore`.

- [ ] **Step 2: `src/blog/states.ts`**
```ts
import { array, defineState, single } from "rxfy";
import { z } from "zod";
import { commentModel, postModel, userModel } from "./resources.js";

export const postsState = defineState({
  key: "posts",
  params: z.object({}),
  model: { posts: array(postModel), authors: array(userModel) },
});

export const postDetailState = defineState({
  key: "post-detail",
  params: z.object({ postId: z.string() }),
  model: { post: single(postModel), author: single(userModel), comments: array(commentModel) },
});
```

- [ ] **Step 3: `src/routes.ts`** — single source of url ↔ state mapping (used by both the SSR grant step and the client router):
```ts
import type { StateChannelDescriptor } from "rxfy-server";
import { postDetailState, postsState } from "./blog/states.js";

export type Route =
  | { name: "home" }
  | { name: "post"; postId: string }
  | { name: "not-found" };

/** Parse a pathname into a route. */
export function matchRoute(pathname: string): Route {
  if (pathname === "/") return { name: "home" };
  const m = /^\/posts\/([^/]+)\/?$/.exec(pathname);
  if (m) return { name: "post", postId: decodeURIComponent(m[1]) };
  return { name: "not-found" };
}

/** The state instances a route renders — used to mint grant channels during SSR. */
export function routeStates(route: Route): Array<{ state: StateChannelDescriptor; params: Record<string, unknown> }> {
  if (route.name === "home") return [{ state: postsState, params: {} }];
  if (route.name === "post") return [{ state: postDetailState, params: { postId: route.postId } }];
  return [];
}
```

- [ ] **Step 4: verify + commit**
Run: `pnpm --filter vite-blog-framework check-types` (0 errors — `array`/`single`/`defineState` typecheck against the derived models).
> If `defineResource(...).model` (a `ModelDescriptor`) doesn't satisfy `array()`/`single()` due to the branded-key generics, it will — `array<T,TKey>(model: ModelDescriptor<T,TKey>)`. Report any cast needed.
```bash
git add examples/vite-blog-framework/src/blog/resources.ts examples/vite-blog-framework/src/blog/states.ts examples/vite-blog-framework/src/routes.ts
git commit -m "feat(example): add shared resources, states, and route map"
```

---

## Task 4: Server — live.ts + api.ts + ws.ts

**Files:** `server/live.ts`, `server/api.ts`, `server/ws.ts`.

- [ ] **Step 1: `server/live.ts`**
```ts
import { createInMemoryHub, createServer, createTopicKeyer } from "rxfy-server";
import { resources } from "../src/blog/resources.js";
import { db } from "./db.js";

export const hub = createInMemoryHub();

export const live = createServer({
  db,
  resources,
  hub,
  keyer: createTopicKeyer({ secret: process.env.RXFY_SECRET ?? "dev-secret", windowMs: 10 * 60_000 }),
});
```

- [ ] **Step 2: `server/api.ts`** — Hono routes calling `live.*`. Creates/deletes `touch` the state channels; edits broadcast a patch automatically.
```ts
import { Hono } from "hono";
import { touch } from "rxfy-server";
import { commentResource, postResource, userResource } from "../src/blog/resources.js";
import { postDetailState, postsState } from "../src/blog/states.js";
import { comments, db, posts, users } from "./db.js";
import { live } from "./live.js";

const id = () => crypto.randomUUID();

export const api = new Hono();

// list posts (+ authors) and mint grants for the client live wiring
api.get("/posts", async (c) => {
  const { createModelRegistry } = await import("rxfy");
  const { normalizeResult } = await import("rxfy");
  const allPosts = await db.select().from(posts);
  const allUsers = await db.select().from(users);
  const registry = createModelRegistry();
  const data = { posts: allPosts, authors: allUsers };
  const idsShape = normalizeResult(registry, postsState.fields, data);
  const grants = live.grant(registry, {
    entities: [postResource, userResource],
    states: [{ state: postsState, params: {} }],
  });
  return c.json({ data, ids: idsShape, grants });
});

// post detail (+ author + comments) and grants
api.get("/posts/:id", async (c) => {
  const postId = c.req.param("id");
  const { eq } = await import("drizzle-orm");
  const { createModelRegistry, normalizeResult } = await import("rxfy");
  const [post] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!post) return c.json({ error: "not found" }, 404);
  const [author] = await db.select().from(users).where(eq(users.id, post.authorId));
  const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
  const data = { post, author, comments: postComments };
  const registry = createModelRegistry();
  const ids = normalizeResult(registry, postDetailState.fields, data);
  const grants = live.grant(registry, {
    entities: [postResource, userResource, commentResource],
    states: [{ state: postDetailState, params: { postId } }],
  });
  return c.json({ data, ids, grants });
});

// create post -> touch the posts channel
api.post("/posts", async (c) => {
  const { authorId, title, body } = (await c.req.json()) as { authorId: string; title: string; body: string };
  const row = await live.create(postResource, { id: id(), authorId, title, body }, { touch: [touch(postsState, {})] });
  return c.json(row);
});

// edit post -> live patch (in place)
api.patch("/posts/:id", async (c) => {
  const postId = c.req.param("id");
  const patch = (await c.req.json()) as Partial<{ title: string; body: string }>;
  const row = await live.update(postResource, postId, patch);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

// delete post -> touch the posts channel
api.delete("/posts/:id", async (c) => {
  await live.delete(postResource, c.req.param("id"), { touch: [touch(postsState, {})] });
  return c.json({ ok: true });
});

// create comment on a post -> touch that post's detail channel
api.post("/posts/:id/comments", async (c) => {
  const postId = c.req.param("id");
  const { author, body } = (await c.req.json()) as { author: string; body: string };
  const row = await live.create(
    commentResource,
    { id: id(), postId, author, body },
    { touch: [touch(postDetailState, { postId })] },
  );
  return c.json(row);
});

// edit comment -> live patch
api.patch("/comments/:id", async (c) => {
  const patch = (await c.req.json()) as Partial<{ body: string }>;
  const row = await live.update(commentResource, c.req.param("id"), patch);
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

// delete comment -> touch the owning post's detail channel
api.delete("/posts/:postId/comments/:id", async (c) => {
  const postId = c.req.param("postId");
  await live.delete(commentResource, c.req.param("id"), { touch: [touch(postDetailState, { postId })] });
  return c.json({ ok: true });
});
```
> The GET endpoints return `{ data, ids, grants }`: `data` is the denormalized shape (so `useStateData`'s `fetchFn` can return it directly), `grants` is the topic/channel-id map for the live client. `normalizeResult`/`createModelRegistry` are imported from `rxfy` (dynamic import keeps the example's import graph simple; a top-level import is equally fine — prefer top-level and remove the `await import` if it type-checks cleanly).
> SIMPLIFY during implementation: hoist the `rxfy`/`drizzle-orm` imports to the top of the file (top-level), not dynamic — the dynamic imports above are only to keep the snippet self-contained. Use top-level imports.

- [ ] **Step 3: `server/ws.ts`** — bridge `createWsServer(hub)` to `@hono/node-ws`:
```ts
import { EventEmitter } from "node:events";
import type { UpgradeWebSocket } from "hono/ws";
import { createWsServer } from "rxfy-ws";
import { hub } from "./live.js";

const wsServer = createWsServer(hub);

/** Register the `/live` WebSocket route on a Hono app using its upgradeWebSocket helper. */
export function liveRoute(upgradeWebSocket: UpgradeWebSocket) {
  return upgradeWebSocket(() => {
    const emitter = new EventEmitter();
    return {
      onOpen: (_evt: unknown, ws: { send: (data: string) => void }) => {
        wsServer.handleConnection({ send: (data) => ws.send(data), on: (e, cb) => emitter.on(e, cb) });
      },
      onMessage: (evt: { data: unknown }) => emitter.emit("message", evt.data),
      onClose: () => emitter.emit("close"),
    };
  });
}
```
> The `rxfy-ws` `ServerSocket` is structural (`{ send, on }`); the shim maps Hono's `onMessage`/`onClose` callbacks onto an `EventEmitter` that the adapter's `socket.on(...)` listens to. `wsServer` is created ONCE (module scope) so the single `hub.onPublish` sink is registered once; `handleConnection` runs per socket. Adjust the `onOpen`/`onMessage` param types to match `@hono/node-ws`'s actual `WSContext`/`MessageEvent` types (read them; the `evt.data` is the raw frame — `.toString()`-able). Report the final types.

- [ ] **Step 4: verify + commit**
Run: `pnpm --filter vite-blog-framework check-types` (resolve any `@hono/node-ws` type specifics; the runtime is correct).
```bash
git add examples/vite-blog-framework/server/live.ts examples/vite-blog-framework/server/api.ts examples/vite-blog-framework/server/ws.ts
git commit -m "feat(example): server live store, REST API, and ws bridge"
```

---

## Task 5: Server — render.ts (SSR + grants) + index.ts

**Files:** `server/render.ts`, `src/entry-server.tsx`, `server/index.ts`.

- [ ] **Step 1: `src/entry-server.tsx`** — buffered SSR that returns html + the per-route grants (so `render.ts` can build the state script). Adapt `examples/vite-realtime-todos/src/entry-server.tsx`:
```ts
import { PassThrough } from "node:stream";
import { StrictMode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import { live } from "../server/live.js";
import { App } from "./App.js";
import { postResource, userResource, commentResource } from "./blog/resources.js";
import { matchRoute, routeStates } from "./routes.js";

export function render(url: string): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry();
  const route = matchRoute(new URL(url, "http://localhost").pathname);

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <App url={url} />
        </StoreProvider>
      </StrictMode>,
      {
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => {
            const grants = live.grant(registry, {
              entities: [postResource, userResource, commentResource],
              states: routeStates(route),
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
> `entry-server` imports `server/live.ts` (the per-process `live`/`hub`/`db`). That's fine — the SSR entry runs in the same Node process. The SSR render uses `useStateData` with `fetchFn`s that, on the server, read from the in-process DB (see Task 6 `api-client` — on the server it can call the DB directly OR fetch `/api`; SIMPLEST: the `fetchFn` does a relative `fetch` to the same server's `/api`, which works in Node 18+ with an absolute URL — but during SSR the server isn't listening to itself cleanly). DECISION: for SSR, seed via a server-side fetcher that queries the DB directly. Implement `fetchPostsServer`/`fetchPostDetailServer` in `api-client.ts` guarded by `typeof window === "undefined"`, OR pass `defaultData` via the route. KEEP IT SIMPLE: the `fetchFn` checks `typeof window === "undefined"` and, if server, imports the DB query inline; if client, does `fetch('/api/...')`. The plan's Task 6 defines this dual fetcher. Confirm the chosen approach in your report.

- [ ] **Step 2: `server/render.ts`** — thin wrapper used by `index.ts` (dev: `ssrLoadModule`; prod: import built bundle). Mirror the inline render logic in `examples/vite-realtime-todos/server/index.ts`'s catch-all; extract it here for clarity:
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

- [ ] **Step 3: `server/index.ts`** — Hono app (adapt the todos `server/index.ts`): mount `api`, the `/live` ws route, vite middleware (dev) / static (prod), SSR catch-all, own the Node http server, `injectWebSocket`, `await initDb()` before listen.
```ts
/* eslint-disable turbo/no-undeclared-env-vars */
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
const port = 5176;

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
server.listen(port, () => console.log(`Live blog at http://localhost:${port}`));
```

- [ ] **Step 4: verify + commit** — `pnpm --filter vite-blog-framework check-types`.
```bash
git add examples/vite-blog-framework/server/render.ts examples/vite-blog-framework/server/index.ts examples/vite-blog-framework/src/entry-server.tsx
git commit -m "feat(example): SSR render with grants and the Hono server"
```

---

## Task 6: Client — live singleton, api-client, entry-client, App

**Files:** `src/live-singleton.ts`, `src/blog/api-client.ts`, `src/entry-client.tsx`, `src/App.tsx`.

- [ ] **Step 1: `src/live-singleton.ts`**
```ts
import type { LiveClient } from "rxfy-react";

let client: LiveClient | undefined;
export const setLiveClient = (c: LiveClient): void => void (client = c);
export const getLiveClient = (): LiveClient | undefined => client;
```

- [ ] **Step 2: `src/blog/api-client.ts`** — dual fetchers (server reads DB directly; client fetches `/api` and merges grants) + mutation helpers:
```ts
import type { Comment, Post, User } from "./types.js";
import { getLiveClient } from "../live-singleton.js";

const isServer = typeof window === "undefined";

type PostsShape = { posts: Post[]; authors: User[] };
type DetailShape = { post: Post; author: User; comments: Comment[] };

export async function fetchPosts(): Promise<PostsShape> {
  if (isServer) {
    const { db, posts, users } = await import("../../server/db.js");
    const { eq } = await import("drizzle-orm");
    void eq;
    return { posts: await db.select().from(posts), authors: await db.select().from(users) };
  }
  const res = await fetch("/api/posts");
  const body = (await res.json()) as { data: PostsShape; grants: { entities: Record<string, string>; channels: Record<string, string> } };
  getLiveClient()?.addGrants(body.grants);
  return body.data;
}

export async function fetchPostDetail({ postId }: { postId: string }): Promise<DetailShape> {
  if (isServer) {
    const { db, posts, users, comments } = await import("../../server/db.js");
    const { eq } = await import("drizzle-orm");
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new Error(`Post ${postId} not found`);
    const [author] = await db.select().from(users).where(eq(users.id, post.authorId));
    const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
    return { post, author, comments: postComments };
  }
  const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`);
  if (!res.ok) throw new Error(`Post ${postId} not found`);
  const body = (await res.json()) as { data: DetailShape; grants: { entities: Record<string, string>; channels: Record<string, string> } };
  getLiveClient()?.addGrants(body.grants);
  return body.data;
}

const post = (url: string, payload: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
const patch = (url: string, payload: unknown) =>
  fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
const del = (url: string) => fetch(url, { method: "DELETE" });

export const createPost = (p: { authorId: string; title: string; body: string }) => post("/api/posts", p);
export const editPost = (id: string, p: { title?: string; body?: string }) => patch(`/api/posts/${id}`, p);
export const deletePost = (id: string) => del(`/api/posts/${id}`);
export const addComment = (postId: string, p: { author: string; body: string }) => post(`/api/posts/${postId}/comments`, p);
export const editComment = (id: string, p: { body: string }) => patch(`/api/comments/${id}`, p);
export const deleteComment = (postId: string, id: string) => del(`/api/posts/${postId}/comments/${id}`);
```
> The dual server/client fetcher keeps the example single-codebase. On the server (SSR) it reads PGlite directly (no self-fetch); on the client it hits `/api` and merges grants. The `void eq` in `fetchPosts` is a lint guard if `eq` is unused there — remove if you don't import it. Clean up unused imports to satisfy `noUnusedLocals`.

- [ ] **Step 3: `src/entry-client.tsx`** — create the live client once, set the singleton, hydrate:
```ts
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { createLiveClient, readSsrGrants, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { useModelRegistry } from "rxfy-react";
import { App } from "./App.js";
import { resources } from "./blog/resources.js";
import { setLiveClient } from "./live-singleton.js";
import "./styles.css";

function Root() {
  const registry = useModelRegistry();
  // build the live client once, against the same registry StoreProvider drained
  const liveClient = (() => {
    const c = createLiveClient({
      registry,
      transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
      grants: readSsrGrants(),
    });
    setLiveClient(c);
    return c;
  })();
  return <App url={location.pathname} liveClient={liveClient} />;
}
```
> PROBLEM: `useModelRegistry()` must be called INSIDE `StoreProvider`, and the `liveClient` must be passed BACK into `StoreProvider`. Resolve this ordering with a two-provider pattern: render `<StoreProvider ssr>` (creates/drains the registry), then an inner component reads the registry via `useModelRegistry()`, builds the live client, and renders a SECOND `<StoreProvider ssr registry={sameRegistry} liveClient={c}>`? That double-wraps. CLEANER: create the registry explicitly in entry-client, drain SSR into it is automatic via StoreProvider; but to build the live client we need the registry instance. SIMPLEST CORRECT APPROACH: pass an explicit registry to StoreProvider.
>
> Implement entry-client as:
```ts
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { createModelRegistry } from "rxfy";
import { createLiveClient, readSsrGrants, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { App } from "./App.js";
import { setLiveClient } from "./live-singleton.js";
import "./styles.css";

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
      <App url={location.pathname} />
    </StoreProvider>
  </StrictMode>,
);
```
> Passing an explicit `registry` to `StoreProvider` makes it drain `window.__RXFY_SSR__` into THAT registry (confirm StoreProvider uses the provided registry for hydration — it does: the `registry` prop is the external registry and hydration drains into it). `readSsrGrants()` reads the same payload. The live client now shares the exact registry components read from. This is the canonical wiring.

- [ ] **Step 4: `src/App.tsx`** — a tiny client router (no router dep) keyed off `location.pathname`, with in-app navigation via `history.pushState` + a `popstate`/click handler. Props: `{ url }` (initial path for SSR). Render `<PostList/>` for `/`, `<PostDetail postId/>` for `/posts/:id`, else a not-found. Provide a `navigate(path)` via context or simple module function that pushes state and updates a `useState` path. Keep it ~40 lines. Use `matchRoute` from `routes.ts`.
```tsx
import { useEffect, useState } from "react";
import { matchRoute } from "./routes.js";
import { PostList } from "./components/PostList.js";
import { PostDetail } from "./components/PostDetail.js";

let setPathExternal: ((p: string) => void) | undefined;
export function navigate(path: string): void {
  history.pushState(null, "", path);
  setPathExternal?.(path);
}

export function App({ url }: { url: string }) {
  const [path, setPath] = useState(() => new URL(url, "http://localhost").pathname);
  useEffect(() => {
    setPathExternal = setPath;
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      setPathExternal = undefined;
    };
  }, []);

  const route = matchRoute(path);
  return (
    <main className="container">
      <header><a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}><h1>rxfy live blog</h1></a></header>
      {route.name === "home" && <PostList />}
      {route.name === "post" && <PostDetail postId={route.postId} />}
      {route.name === "not-found" && <p className="status">Not found.</p>}
    </main>
  );
}
```
> `entry-server` calls `<App url={url} />` (no `useEffect`/`navigate` runs server-side; the initial `path` comes from `url`). `entry-client` calls `<App url={location.pathname} />`.

- [ ] **Step 5: verify + commit** — `pnpm --filter vite-blog-framework check-types`.
```bash
git add examples/vite-blog-framework/src/live-singleton.ts examples/vite-blog-framework/src/blog/api-client.ts examples/vite-blog-framework/src/entry-client.tsx examples/vite-blog-framework/src/App.tsx
git commit -m "feat(example): client live wiring, api-client, and router"
```

---

## Task 7: Components

**Files:** `src/components/*.tsx`.

Build the presentational components using the `Pending` + `useModelStore(model).get(id)` pattern from `examples/waku-blog` (read `PostList.tsx`/`PostDetail.tsx`/`AddCommentForm.tsx` there and adapt — swap the `*model` imports for this example's `postModel`/`userModel`/`commentModel`, and the row field names: posts have `authorId`/`title`/`body`, comments have `author`/`body`). Add the live badge + forms.

- [ ] **Step 1: `UpdatesBadge.tsx`** — the reusable badge:
```tsx
import { useObservable } from "rxfy-react";
import type { Observable } from "rxjs";

export function UpdatesBadge({ available$, onApply, noun }: { available$: Observable<number>; onApply: () => void; noun: string }) {
  const n = useObservable(available$, 0);
  if (n <= 0) return null;
  return (
    <button className="badge-button" onClick={onApply}>
      {n} new {noun}{n === 1 ? "" : "s"} · click to refresh
    </button>
  );
}
```

- [ ] **Step 2: `PostList.tsx`** — `useStateData(postsState, fetchPosts, {})`; render the badge from `handle.updatesAvailable$` + `handle.applyUpdates`; `Pending` over `handle.data$` → map `posts` ids to `<PostItem id>`; include `<NewPostForm/>`.
- [ ] **Step 3: `PostItem.tsx`** — `useModelStore(postModel).get(id)` + author via `useModelStore(userModel).get(post.authorId)`; link to `/posts/:id` via `navigate`; edit/delete buttons (`editPost`/`deletePost` from api-client); inline `<EditPostForm/>` toggled by local state.
- [ ] **Step 4: `PostDetail.tsx`** — `useStateData(postDetailState, fetchPostDetail, { postId })`; badge ("comment"); render post (live-editable) + author + comments via ids; `<AddCommentForm/>`.
- [ ] **Step 5: `CommentItem.tsx`** — `useModelStore(commentModel).get(id)`; delete button (`deleteComment`).
- [ ] **Step 6: `NewPostForm.tsx` / `EditPostForm.tsx` / `AddCommentForm.tsx`** — controlled forms (template from waku `AddCommentForm.tsx`) that call the api-client mutation helpers. NewPostForm picks an author from the seeded users (hardcode the 3 ids `u1/u2/u3` in a select, or fetch users). On submit, call the helper; the live broadcast handles propagation (no local mutation needed — creates show via the badge in OTHER tabs; in the SAME tab, call `handle.applyUpdates()` after a successful create to refresh immediately, OR rely on the badge. KEEP: after a successful create/delete in the same tab, call the relevant `applyUpdates()` so the acting tab updates immediately).
> Each component is small and focused. After writing all, run `pnpm --filter vite-blog-framework check-types && pnpm --filter vite-blog-framework lint`.

- [ ] **Step 7: commit**
```bash
git add examples/vite-blog-framework/src/components
git commit -m "feat(example): blog components with live badge and forms"
```

---

## Task 8: Smoke test, README, final verification

**Files:** `server/live.smoke.test.ts`, `README.md`.

- [ ] **Step 1: `server/live.smoke.test.ts`** — boot `live` over a fresh PGlite and assert the write+broadcast path (reuse the framework's own style; no HTTP/React):
```ts
import { createInMemoryHub, createServer, createTopicKeyer, touch } from "rxfy-server";
import { parseServerMessage, type ServerMessage } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { commentResource, postResource, resources, userResource } from "../src/blog/resources.js";
import { postsState } from "../src/blog/states.js";

async function freshDb() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();
  const db = drizzle(client);
  await client.exec(`
    CREATE TABLE users (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL);
    CREATE TABLE posts (id text PRIMARY KEY, author_id text NOT NULL, title text NOT NULL, body text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE comments (id text PRIMARY KEY, post_id text NOT NULL, author text NOT NULL, body text NOT NULL, created_at timestamp NOT NULL DEFAULT now());
  `);
  return db;
}

describe("vite-blog-framework live server", () => {
  it("create posts persists and touches the posts channel", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const keyer = createTopicKeyer({ secret: "t", windowMs: 60_000, now: () => 0 });
    const live = createServer({ db, resources, hub, keyer });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe("client", [keyer.current("posts")]);

    const row = await live.create(postResource, { id: "p1", authorId: "u1", title: "Hi", body: "B" }, { touch: [touch(postsState, {})] });
    expect(row).toMatchObject({ id: "p1", title: "Hi" });
    expect(received).toEqual([{ v: 1, kind: "stale", channel: "posts" }]);

    // resources expose the three models
    expect(resources.byName("post")).toBe(postResource);
    expect(resources.byName("user")).toBe(userResource);
    expect(resources.byName("comment")).toBe(commentResource);
    void parseServerMessage; // (imported for parity with framework tests; not needed here)
  });

  it("update broadcasts a patch on the entity topic", async () => {
    const db = await freshDb();
    const hub = createInMemoryHub();
    const keyer = createTopicKeyer({ secret: "t", windowMs: 60_000, now: () => 0 });
    const live = createServer({ db, resources, hub, keyer });
    await live.create(postResource, { id: "p1", authorId: "u1", title: "Old", body: "B" });

    const received: ServerMessage[] = [];
    hub.onPublish((_conn, msg) => received.push(msg));
    hub.subscribe("client", [keyer.current("post:p1")]);

    const row = await live.update(postResource, "p1", { title: "New" });
    expect(row).toMatchObject({ title: "New" });
    expect(received).toEqual([{ v: 1, kind: "patch", name: "post", id: "p1", data: { id: "p1", authorId: "u1", title: "New", body: "B", createdAt: expect.any(Date) } }]);
  });
});
```
Run: `pnpm --filter vite-blog-framework test` → both pass. (Remove the unused `parseServerMessage` import if it trips lint; it's there only to mirror framework-test imports — prefer removing it.)

- [ ] **Step 2: `README.md`** — what it is, `pnpm --filter vite-blog-framework dev` (→ http://localhost:5176), and the two-tab demo script: (1) open two tabs; (2) in tab A create a post → tab B shows "1 new post · click to refresh"; (3) edit a post → both tabs update live (no refresh); (4) open a post, add a comment in tab A → tab B's open post page shows "1 new comment"; (5) delete → badge. Note it uses PGlite (in-memory; data resets on restart) and the rxfy live framework (link the packages).

- [ ] **Step 3: final verification**
Run: `pnpm --filter vite-blog-framework check-types && pnpm --filter vite-blog-framework lint && pnpm --filter vite-blog-framework test && pnpm --filter vite-blog-framework build`
Expected: types clean, lint clean, smoke tests pass, and BOTH `build:client` + `build:server` produce `dist/`. (The build is the real integration check that the SSR entry + client entry compile through Vite.)

- [ ] **Step 4: manual run sanity (optional but recommended)** — `pnpm --filter vite-blog-framework dev`, open http://localhost:5176, confirm the posts list renders (SSR), then stop. (If launching the app is out of scope for the executor, skip — the build + smoke test are the automated gates.)

- [ ] **Step 5: commit**
```bash
git add examples/vite-blog-framework/server/live.smoke.test.ts examples/vite-blog-framework/README.md
git commit -m "test(example): live server smoke test + README"
```

---

## Self-Review Notes

- **Spec coverage:** Hono+Vite SSR+PGlite+Drizzle (Tasks 1,2,5), resources/states (Task 3), live API + ws bridge (Task 4), SSR grants (Task 5), client live wiring + badge + forms (Tasks 6,7), smoke test + README (Task 8). The two badges = `useStateData(postsState/postDetailState).updatesAvailable$`; live edits via `createLiveClient` patches; creates/deletes via `touch`.
- **Known wrinkles flagged for the implementer:** (a) the GET endpoints normalize into a throwaway registry purely to mint grants — `data` is what the client fetcher returns; (b) the dual server/client `fetchFn` (SSR reads PGlite directly, client fetches `/api` + `addGrants`); (c) the `@hono/node-ws` ↔ structural `ServerSocket` EventEmitter shim; (d) `entry-client` passes an explicit `registry` to `StoreProvider` so the live client shares it; (e) prefer top-level imports over the `await import` used in snippets for self-containment.
- **YAGNI:** tiny `useState` router (no router dep); no auth; no pagination; one smoke test (examples are demos). 
- **Type consistency:** `live.create/update/delete` + `touch` from `rxfy-server`; `createWsServer` from `rxfy-ws`; `createWsClient` from `rxfy-ws/client`; `createLiveClient`/`readSsrGrants`/`StoreProvider`/`useStateData`/`useObservable`/`useModelStore` from `rxfy-react`; `defineResource`/`createResourceRegistry`/`defineState`/`array`/`single`/`createModelRegistry`/`normalizeResult`/`dehydrate`/`hydrationScript` from `rxfy`/`rxfy-server`. Resource names `"user"`/`"post"`/`"comment"`; channels `"posts"` and `"post-detail:postId=<id>"`.
