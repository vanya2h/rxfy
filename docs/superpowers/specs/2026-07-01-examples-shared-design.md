# examples-shared — Unified Blog UI Across Examples Design

**Date:** 2026-07-01
**Status:** Approved architecture; pending final spec review
**New package:** `examples/example-shared` (workspace name `examples-shared`, private, never published)

## 1. Goal

Make the four blog examples — `next-blog`, `rr7-blog`, `waku-blog`, `vite-blog-framework` — **look the
same** by extracting the shared **UI** (shadcn components + theme + read components) and the shared
**data shape** (Zod models/states/types) into one workspace package. Data **transport is unified on
Hono RPC**: every example runs its own Hono app + typed `hc` client (no shared API). Each example keeps
only its framework glue (routing, SSR seeding, `"use client"` boundaries, Hono mounting, and — for vite
— the Drizzle/live backend).

Locked decisions:
- **All four** unify on **shadcn/ui + Tailwind v4**.
- **`examples-shared` holds UI only** — components + shadcn UI + theme + the shared Zod
  **models/states/types + canonical seed content** (the shape/content the components are typed against).
  **No fetch/RPC/DB logic lives in the shared package.**
- **All four fetch via their own Hono RPC client** (`hono/client` `hc<AppType>`); the fetchers are
  **per-example** and passed to the shared components as props.
- **Shared read UI + add-comment** everywhere; vite's create/edit/delete are **additive** via slots.
- Per-example variation injected via a **`BlogProvider`** context (`navigate`, `onAddComment`).
- Backend per example: **next/rr7/waku = plain in-memory behind Hono**; **vite = Drizzle/Postgres + live**.
- One small **`rxfy-server` addition**: `defineResource({ model })` (vite binds its live resource to the
  shared model).

## 2. Scope

### In scope
- `rxfy-server` addition: `defineResource` accepts an optional pre-made `model`. Changeset + tests.
- `examples/example-shared`: shadcn UI (monorepo pattern) + theme CSS; shared Zod models/states/types +
  canonical seed arrays; shared read components + `BlogProvider`; `UpdatesBadge` (inert without a live
  client). No fetch/RPC/DB.
- Each example gains a **Hono app** (typed blog routes) + a typed `hc` RPC client + fetchers/mutations as
  RPC calls; mounts Hono per its framework; renders the shared components via `BlogProvider`.
- The three plain examples adopt Tailwind v4 + the shared theme and delete their local
  blog/components/CSS + in-memory-fetcher modules (replaced by Hono handlers + RPC).

### Non-goals
- No shared API/backend package (per-example Hono, by decision).
- No Drizzle/DB for next/rr7/waku (plain in-memory behind Hono).
- No full create/edit/delete parity for the three (shared read UI + add-comment; vite keeps extras).
- No change to each framework's SSR-seeding mechanism.
- No visual/e2e tests; gates stay `check-types`/`lint`/`build` per example (+ vite server smoke test) and
  a light data-shape test in the shared package.
- No publishing.

## 3. Architecture

```
              examples/example-shared  (workspace: examples-shared) — UI ONLY
   ┌──────────────────────────────────────────────────────────────────────┐
   │ src/data   Zod User/Post/Comment models + states + types + seed[]       │  shape + content
   │ src/ui     shadcn primitives (button/card/input/textarea/badge/…)+utils │  shared look
   │ src/blog   PostList/PostItem/PostDetail/CommentItem/AddCommentForm       │  shared read UI
   │            + UpdatesBadge + BlogProvider(navigate, onAddComment)         │
   │ src/styles.css  Tailwind v4 + shadcn neutral theme                       │
   └──────────────────────────────────────────────────────────────────────┘
        ▲ consumed as SOURCE ("use client" preserved; Tailwind @source scans it)
        │  components take fetchPosts/fetchPostDetail as PROPS
  ┌──────────────┬──────────────┬──────────────┬────────────────────────────┐
  │ next-blog    │ rr7-blog     │ waku-blog    │ vite-blog-framework        │
  │ Hono mounted │ Hono mounted │ Hono mounted │ Hono is the server         │
  │  as route    │  as resource │  as API/mw   │  (existing)                │
  │ hc RPC client│ hc RPC client│ hc RPC client│ hc RPC client              │
  │ in-memory db │ in-memory db │ in-memory db │ Drizzle/Postgres + LIVE     │
  │ navigate:    │ navigate:    │ navigate:    │ navigate: history API      │
  │  useRouter   │  useNavigate │  waku router │                            │
  └──────────────┴──────────────┴──────────────┴────────────────────────────┘
```

Every example: mount a Hono app → build a typed `hc` client → wrap the shared components in
`<BlogProvider navigate onAddComment>` and pass RPC `fetchPosts`/`fetchPostDetail` as props, all inside
its own `StoreProvider` + routing + SSR seeding, importing `examples-shared/styles.css`.

## 4. `rxfy-server` addition — `defineResource({ model })`

vite's live client uses the shared `postModel`. Its live server must enumerate/broadcast against that
same model instance. `defineResource` gains an optional pre-made model:

```ts
export function defineResource<TTable extends PgTable>(config: {
  table: TTable;
  name?: string;
  model?: ModelDescriptor<InferSelectModel<TTable>>; // NEW — use instead of deriving
}): Resource<TTable> { … }
```
- `model` provided → `resource.model = config.model`; `resource.name = config.name ?? model.name ?? tableName`; PK still from the table.
- Omitted → unchanged (derive via drizzle-zod).

Effect: `defineResource({ table: posts, model: postModel /* shared */ })` → `grant`/`patch`/`stale` route
into the shared store (keyed by name `"post"`), while the Drizzle table still drives SQL. Backward
compatible (new optional field). Tests: injected model + name; grant enumerates the injected store. New
`rxfy-server` minor changeset.

## 5. Shared data + content (`examples-shared/src/data`)

The Zod layer is the single source (convention `userId`, comment `name`, `meta` on the list state):

```ts
// models.ts — branded ids + createModel("user"|"post"|"comment")
export const PostSchema = z.object({ id: PostIdSchema, userId: UserIdSchema, title: z.string(), body: z.string() });
export const CommentSchema = z.object({ id: CommentIdSchema, postId: PostIdSchema, name: z.string(), body: z.string() });
export const postModel = createModel({ schema: PostSchema, getKey: (x) => x.id, name: "post" }); // + user, comment

// states.ts
export const postsState = defineState({ key: "posts", params: z.object({}),
  model: { posts: array(postModel), authors: array(userModel), meta: z.object({ total: z.number(), generatedAt: z.string() }) } });
export const postDetailState = defineState({ key: "post-detail", params: z.object({ postId: PostIdSchema }),
  model: { post: single(postModel), author: single(userModel), comments: array(commentModel) } });

// types.ts — User, Post, Comment (z.infer)
// seed.ts — canonical arrays (5 posts, 3 users, comments) so every example shows identical content
```

- Shared so all four render identical content and typed shapes. **No fetchers here.**
- vite's Drizzle schema aligns to this shape (`user_id`, comment `name`; `createdAt` is an ignored extra).
  vite seeds its Postgres from `seed.ts`. The three seed their in-memory copy from `seed.ts`.
- `meta` stays; each example's Hono `GET /posts` computes `{ total, generatedAt }`.

## 6. Shared components + injection (`examples-shared/src/blog`)

- **`BlogProvider` / `useBlog`** — context `{ navigate: (path: string) => void; onAddComment: (postId: string, input: { name: string; body: string }) => void | Promise<void> }`. Links are plain `<a href onClick={e => { e.preventDefault(); navigate(href); }}>`. The impls (router push / RPC mutation) live in each example.
- **`PostList`** — props `{ fetchPosts: () => Promise<{ posts: Post[]; authors: User[]; meta }>; header?: ReactNode }`; runs `useStateData(postsState, fetchPosts, {})`; renders `UpdatesBadge`, the `header` slot (vite → `NewPostForm`), meta line, and `PostItem`s.
- **`PostItem`** — `useModelStore(postModel).get(id)` + author; `Card` + title link (via `navigate`); optional `actions?: ReactNode` (vite → edit/delete).
- **`PostDetail`** — props `{ postId: string; fetchPostDetail: (p:{postId:string}) => Promise<…>; actions?: ReactNode }`; `useStateData(postDetailState, fetchPostDetail, { postId })`; `UpdatesBadge` (noun "comment"); `Card` + post/author/comments + `AddCommentForm`.
- **`CommentItem`** — `useModelStore(commentModel).get(id)`; read card; optional `actions?` (vite → delete).
- **`AddCommentForm`** — controlled name+body; submit → `useBlog().onAddComment(postId, { name, body })`.
- **`UpdatesBadge`** — `useObservable(handle.updatesAvailable$, 0)`; `Button` when `>0`, else null. `of(0)` without a live client (the three) → hidden. Live on vite.

All shared components start with `"use client"` (needed by next/waku RSC; ignored by rr7/vite). Fetchers
are **props** (per-example RPC), not context; `navigate`/`onAddComment` are context (needed deep in the tree).

## 7. Per-example Hono RPC + backend

Each example defines a **typed Hono app** and a **`hc<AppType>` client**; fetchers/mutations are thin RPC
wrappers. Routes (uniform shape): `GET /posts` → `{ posts, authors, meta }`, `GET /posts/:id` →
`{ post, author, comments }` (or 404), `POST /posts/:id/comments` → the new comment. (vite adds
create/edit/delete post + delete comment, as today.)

- **next-blog** — mount Hono at `app/api/[[...route]]/route.ts` (`handle(app)` for GET/POST); in-memory db
  seeded from `seed.ts`. RPC client base = same origin.
- **rr7-blog** — mount Hono behind a splat **resource route** (`routes/api.$.ts` calling `app.fetch(request)`);
  in-memory db. RPC client base = same origin.
- **waku-blog** — mount Hono via Waku's API/middleware seam calling `app.fetch`; in-memory db. RPC client
  base = same origin.
- **vite-blog-framework** — Hono already owns the server; give its `/api/*` routes RPC-friendly typing so
  `hc<AppType>` works, and switch `api-client` from raw `fetch` to the `hc` client. Keeps Drizzle/Postgres +
  live + grants + ws. `onAddComment` → RPC `POST comment` (live broadcast handles other clients).

The in-memory data module for the three is per-example (a mutable copy of `seed.ts` + read/mutate helpers
the Hono handlers call). `onAddComment` in the three: Hono `POST` appends to the in-memory list; the
client refetches (or applies the state's `addComment` mutation optimistically) so the new comment appears.

## 8. Per-example migration (each keeps routing + SSR seeding)

- **next-blog (RSC):** delete `blog.ts`/components/blog CSS; add Tailwind v4 + `import "examples-shared/styles.css"`; add the Hono API route + `hc` client; route pages render `<BlogProvider navigate={useRouter().push} onAddComment={rpc}> <PostList fetchPosts={rpc}/> </BlogProvider>`; keep `HydrationStream` + SSR seeding.
- **rr7-blog:** same; `navigate = useNavigate()`; Hono resource route; keep `entry.server` dehydrate + loaders.
- **waku-blog:** same; navigate via waku router; Hono via waku API seam; keep `prefetch()` + `HydrateSnapshot`.
- **vite-blog-framework:** swap local `blog/`+`components/` for shared; `defineResource({ model })`; RPC-type its Hono routes + switch `api-client` to `hc`; inject `NewPostForm`/edit/delete via slots; keep entries/ws/live.

## 9. Testing & gates
- **examples-shared:** a light Vitest test that the models/states normalize the seed shape (and
  `postsState`/`postDetailState` query shapes are as expected). `check-types` + `lint` (+ `build` if built).
- **rxfy-server:** unit tests for `defineResource({ model })`.
- **Each example:** existing `check-types` + `lint` + `build` (+ vite server smoke test). A tiny RPC smoke
  (server responds to `GET /posts`) is optional per example. Manual acceptance = the four read views render
  the identical shadcn UI.

## 10. Phasing (each phase green)
1. **`rxfy-server` `defineResource({ model })`** + tests + changeset.
2. **`examples/example-shared`** — scaffold (shadcn + theme + models/states/types/seed + components +
   `BlogProvider`) + data-shape test. Standalone-lintable/typecheckable.
3. **Migrate vite-blog-framework** — shared components + `defineResource({ model })` + `hc` RPC over its Hono.
   Full gates (proof with the live backend).
4. **Migrate next-blog, then rr7-blog, then waku-blog** — one at a time: Tailwind+theme, own Hono app +
   in-memory db + `hc` client, render shared components via `BlogProvider`, keep SSR/routing glue. Each green.

## 11. Self-review notes
- **Interpretation flagged:** "UI only" is read as *components + shadcn UI + theme + the shared
  models/states/types + canonical seed content*; **fetch/RPC/DB logic is per-example**. Seed content is
  shared so all four show identical posts (core to "look the same"). If the user wants seed per-example too,
  move `seed.ts` out.
- **Consistency:** single Zod data source; one shadcn theme; one component set; uniform Hono-RPC transport
  with per-example servers; `defineResource({ model })` lets vite's live backend use the shared model.
- **Risks:** (a) mounting Hono in three different frameworks (Next route handler / RR resource route / Waku
  API seam) — the biggest new surface; the plan pins each and they're independent. (b) shadcn *source*
  package + Tailwind `@source` across four bundlers, `@/`-alias not leaking into apps — pinned fallback:
  rewrite the shared package's `@/` imports to relative. (c) RSC `"use client"` in shared source — validated
  during next/waku migration.
- **Scope:** large; one plan **per phase** (framework tweak → shared package → vite → each of the three).
