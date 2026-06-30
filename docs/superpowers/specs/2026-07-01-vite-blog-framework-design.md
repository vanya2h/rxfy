# vite-blog-framework — Live Blog Example Design

**Date:** 2026-07-01
**Status:** Approved (pending spec review)
**Location:** `examples/vite-blog-framework` (private, never published)

## 1. Goal

A runnable example that showcases the rxfy live framework end-to-end: a blog where post/comment
**edits apply live in place**, and post/comment **creates and deletes** surface as a
non-intrusive **"N new posts published" / "N new comments"** badge (click to refetch). The
point: the same thing `examples/vite-realtime-todos` does with a hand-rolled WebSocket + manual
dependency tracking, here falls out of the framework "for free" — the badge is literally
`useStateData().updatesAvailable$`, and live edits apply themselves via `createLiveClient`.

Stack: **Hono** (`@hono/node-ws`) + **Vite SSR** (buffered) + **PGlite** (in-process Postgres) +
**Drizzle**, consuming `rxfy`, `rxfy-react`, `rxfy-server`, `rxfy-ws`.

## 2. Scope

### In scope
- Drizzle `pgTable`s for `users`, `posts`, `comments`; `defineResource` for each.
- `createServer` (PGlite + in-memory hub + topic keyer); Hono REST endpoints that call
  `live.update`/`create`/`delete`.
- `rxfy-ws` server adapter bridged to Hono's `upgradeWebSocket`.
- Buffered Vite SSR with per-request registry, `dehydrate` + `live.grant`, hydration script.
- Client: `StoreProvider` with a `liveClient` (over `rxfy-ws/client`), `fetchFn`s that merge
  `grants` via `addGrants`.
- Two pages: posts list (`/`) and post detail (`/posts/:id`), each with the live badge + forms
  for create/edit/delete (posts and comments).
- Minimal, clean CSS in the style of the existing examples.

### Non-goals
- Auth/users management (a small fixed set of seeded users; "author" picked for new posts).
- Pagination (the list is small; `window` is unused here — channels are partition-only).
- Streaming SSR (buffered only; streaming + late-chunk grants is a framework follow-up).
- Production deployment concerns; tests beyond a lightweight server smoke test (examples are
  demonstrations, not test suites — see §9).

## 3. Architecture

```
 Browser (two tabs)                         Node (Hono)
 ┌───────────────────────────┐             ┌──────────────────────────────────────────┐
 │ StoreProvider(registry,    │  WS /live   │ createWsServer(hub) ── handleConnection ──┐│
 │   liveClient)              │◄───────────►│  (bridged to @hono/node-ws via shim)     ││
 │  createLiveClient(         │             │ hub (createInMemoryHub)                   ││
 │    transport=ws/client,    │  REST /api  │ createServer({db,resources,hub,keyer})    ││
 │    grants=readSsrGrants()) │◄───────────►│  POST/PATCH/DELETE → live.create/update/  ││
 │  useStateData → data$ +    │             │    delete (+touch)                        ││
 │   updatesAvailable$ +      │  GET (SSR)  │ Vite SSR: render → dehydrate + grant →    ││
 │   applyUpdates()           │◄───────────►│   hydrationScript                         ││
 └───────────────────────────┘             │ PGlite + Drizzle (users/posts/comments)   ││
                                            └──────────────────────────────────────────┘
```

One `hub`, one `live` server, one `createWsServer(hub)` at startup; `handleConnection` per WS
connection. Per HTTP *render* request: a fresh rxfy `ModelRegistry`. The browser holds one
`registry` + one `liveClient` for the session.

## 4. Data model & resources

`src/db/schema.ts` — Drizzle `pgTable`s (snake_case columns; JS camelCase keys):

```ts
users    (id text pk, name text, email text)
posts    (id text pk, author_id text, title text, body text, created_at timestamp default now)
comments (id text pk, post_id text, author text, body text, created_at timestamp default now)
```

`src/blog/resources.ts` (shared, isomorphic — `defineResource` runs on client+server, pulls
drizzle-orm/drizzle-zod but no DB driver):

```ts
export const userResource    = defineResource({ table: users,    name: "user" });
export const postResource     = defineResource({ table: posts,    name: "post" });
export const commentResource  = defineResource({ table: comments, name: "comment" });
export const resources = createResourceRegistry([userResource, postResource, commentResource]);
```

`userModel = userResource.model`, etc. (drop-in for `useModelStore`/`array`/`single`).

## 5. States → the badges come free

`src/blog/states.ts`:

```ts
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

- `postsState` channel → `"posts"`. `useStateData(postsState).updatesAvailable$` = **"N new posts."**
- `postDetailState` channel → `"post-detail:postId=<id>"` (no `window`; `postId` is partition).
  `useStateData(postDetailState).updatesAvailable$` = **"N new comments"** for that post.

## 6. Live behaviors → framework primitive

| User action | Server endpoint | Framework call | Client effect |
|---|---|---|---|
| Edit post / comment | `PATCH /api/posts/:id`, `PATCH /api/comments/:id` | `live.update(res, id, patch)` | live **in-place** re-render (patch on `post:<id>` / `comment:<id>`) |
| Create post | `POST /api/posts` | `live.create(postResource, values, { touch: [touch(postsState, {})] })` | **"N new posts"** badge |
| Delete post | `DELETE /api/posts/:id` | `live.delete(postResource, id, { touch: [touch(postsState, {})] })` | badge |
| Create comment on X | `POST /api/posts/:id/comments` | `live.create(commentResource, values, { touch: [touch(postDetailState, { postId: X })] })` | **"N new comments"** badge on X |
| Delete comment on X | `DELETE /api/comments/:id` | `live.delete(commentResource, id, { touch: [touch(postDetailState, { postId: X })] })` | badge on X |

`touch(state, params)` and `live.*` come from `rxfy-server`. Edits broadcast a `patch`;
creates/deletes broadcast a bare `stale` on the touched channel.

## 7. Server wiring (`src/server/`)

- **`db.ts`** — `new PGlite()` + `drizzle(client)`; `client.exec(CREATE TABLE …)`; seed a few
  users + posts + comments.
- **`live.ts`** — `createServer({ db, resources, hub: createInMemoryHub(), keyer: createTopicKeyer({ secret, windowMs: 10*60_000 }) })`.
- **`api.ts`** — Hono routes for posts/comments CRUD calling `live.*`; each returns the affected
  row. The list/detail GET endpoints (`GET /api/posts`, `GET /api/posts/:id`) return
  `{ data, grants }` where `grants = live.grant(perRequestRegistry, { entities, states })` — but
  for client-side fetches the registry is the *response shape*, so these endpoints build a
  throwaway registry, seed it, grant, and return ids+grants. (Detail below in the plan.)
- **`ws.ts`** — `const wsServer = createWsServer(hub)` once; Hono `app.get("/live", upgradeWebSocket(() => { … }))` constructs a per-connection EventEmitter shim socket (`{ send: ws.send, on: emitter.on }`) in `onOpen`, calls `wsServer.handleConnection(socket)`, and forwards `onMessage`/`onClose` to the emitter. (The adapter is structural — `send` + `on` — so this is a ~15-line bridge.)
- **`render.ts` + `entry-server.tsx`** — buffered `renderToPipeableStream` + `onAllReady`;
  per-request registry; after render, `hydrationScript({ ...dehydrate(registry), grants })` where
  `grants = live.grant(registry, { entities: [postResource, userResource, commentResource], states: [<the page's state+params>] })`.
- **`index.ts`** — Hono app: mount `/api`, `/live`, Vite middleware (dev) / static (prod), SSR
  catch-all. Own the Node http server so `@hono/node-ws` can attach (the `vite-realtime-todos`
  pattern).

## 8. Client wiring (`src/`)

- **`entry-client.tsx`** — build the registry (drained from `window.__RXFY_SSR__` by
  `StoreProvider`), create the live client once, hydrate root:
  ```ts
  const liveClient = createLiveClient({
    registry, resources,
    transport: createWsClient({ url: `ws://${location.host}/live` }),
    grants: readSsrGrants(),
  });
  hydrateRoot(el, <StoreProvider ssr liveClient={liveClient}><App/></StoreProvider>);
  ```
  (On the server, `entry-server.tsx` renders `<StoreProvider registry ssr>` WITHOUT a live
  client — SSR doesn't subscribe.)
- **`blog/api-client.ts`** — `fetchPosts`/`fetchPostDetail` call the GET endpoints, return the
  denormalized data for `useStateData`'s `fetchFn`, and call `liveClient.addGrants(grants)` from
  the `{ data, grants }` response (the live client is a module singleton set at bootstrap).
  Mutation helpers `createPost`/`editPost`/`deletePost`/`addComment`/`deleteComment` POST/PATCH/
  DELETE to `/api/*`.
- **Components** (`components/`): `PostList`, `PostItem`, `PostDetail`, `CommentList`,
  `NewPostForm`, `EditPostForm`, `AddCommentForm`, `UpdatesBadge`. Reuse the `Pending` +
  `useModelStore(store).get(id)` pattern from `waku-blog`. The badge:
  ```tsx
  const available = useObservable(handle.updatesAvailable$, 0);
  return available > 0 ? <button onClick={handle.applyUpdates}>{available} new posts</button> : null;
  ```

## 9. Error handling & testing

- **Errors:** `fetchFn` rejections render via `Pending`'s `rejected` slot (existing pattern).
  API endpoints return 404 on missing ids; the SSR catch-all returns 500 with the stack in dev
  (the `vite-realtime-todos` pattern). PGlite is in-memory — a fresh DB each process start.
- **Testing:** examples are demonstrations, not libraries. One lightweight **server smoke test**
  (Vitest): boot the `live` server over PGlite, `POST /api/posts` then `GET /api/posts` returns
  it, and a `live.create` with `touch` publishes a `stale` to a subscribed hub connection
  (reusing the framework's own test style). No React/SSR e2e test — manual two-tab verification
  is the acceptance criterion, documented in the README.
- **README:** how to run (`pnpm --filter vite-blog-framework dev`), and the two-tab demo script
  (create a post in tab A → tab B shows "1 new post published" → click to refresh; edit a post →
  both update live; add a comment → the other tab's post page shows "1 new comment").

## 10. Package & tooling

- `examples/vite-blog-framework/package.json` — `"private": true`, name `vite-blog-framework`.
  deps: `hono`, `@hono/node-server`, `@hono/node-ws`, `@electric-sql/pglite`, `drizzle-orm`,
  `react`, `react-dom`, `rxjs`, `zod`, and workspace `rxfy`, `rxfy-react`, `rxfy-server`,
  `rxfy-ws`. dev: `vite`, `tsx`, `typescript`, `@types/*`, the repo eslint/tsconfig.
- Scripts mirror `vite-realtime-todos`: `dev` (`tsx ./server/index.ts`), `build:client`,
  `build:server`, `start`, `lint`, `check-types`.
- No changeset (examples are private/unpublished).

## 11. File structure

```
examples/vite-blog-framework/
  index.html
  vite.config.ts  tsconfig.json  eslint.config.ts  package.json
  src/
    db/schema.ts            # Drizzle pgTables
    blog/resources.ts       # defineResource + registry (shared)
    blog/states.ts          # defineState (shared)
    blog/types.ts           # row types (InferSelectModel) / ids
    blog/api-client.ts      # client fetchers + mutation helpers (+ addGrants)
    live-singleton.ts       # module-level liveClient holder (set at bootstrap)
    App.tsx                 # router (two routes) — minimal client router
    components/*.tsx
    entry-client.tsx
    entry-server.tsx
    styles.css
  server/
    db.ts                   # PGlite + drizzle + seed
    live.ts                 # createServer
    api.ts                  # Hono REST (CRUD → live.*)
    ws.ts                   # createWsServer bridged to @hono/node-ws
    render.ts               # buffered SSR + dehydrate + grant
    index.ts                # Hono app + Node http server + vite + ws
  README.md
```

## 12. Self-review notes

- **Scope:** single example, one plan. The framework packages are done; this only consumes them.
- **Consistency:** the server shape mirrors `vite-realtime-todos`; the state/model/component
  shapes mirror `waku-blog`; the live wiring uses the just-built `rxfy-server`/`rxfy-ws`/
  `createLiveClient`/`useStateData` counter exactly as designed.
- **Ambiguity resolved:** client-side `fetchFn` grant delivery → endpoints return `{ data,
  grants }`, merged via `liveClient.addGrants`; the live client is a module singleton so
  `fetchFn`s (which don't receive it as an arg) can reach it. SSR grant delivery → `readSsrGrants`
  from the hydration payload at bootstrap.
- **Risk:** the Hono `@hono/node-ws` ↔ structural `ServerSocket` bridge is the one non-obvious
  piece; the plan will pin its exact shape. The client router is intentionally tiny (two routes)
  to avoid pulling a router dependency — a minimal `useState`-based path switch is enough.
