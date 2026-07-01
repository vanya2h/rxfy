# examples-shared — Unified Blog UI/Data Across Examples Design

**Date:** 2026-07-01
**Status:** Approved (pending spec review)
**New package:** `examples/example-shared` (workspace name `examples-shared`, private, never published)

## 1. Goal

Make the four blog examples — `next-blog`, `rr7-blog`, `waku-blog`, `vite-blog-framework` — **look the
same** by extracting the shared UI (shadcn), data model, and read-view components into one workspace
package (`examples-shared`). Each example keeps only its framework-specific glue (routing, SSR
seeding, `"use client"` boundaries, and — for vite — the Drizzle/live backend).

Decisions (locked during brainstorming):
- **All four** unify on **shadcn/ui + Tailwind v4** (the three plain examples adopt shadcn).
- **Shared Zod model is the single source of truth** (models/states/types live in the package; all
  four import them). vite's Drizzle tables become a persistence layer that maps onto the shared shape.
- **Shared read UI + add-comment** across all four; vite's create/edit/delete are **additive**
  (composed via optional slots), not shared.
- Per-example variation is **injected via a `BlogProvider` context** (`navigate`, `onAddComment`) and
  optional render slots.
- Enabled by a small **`rxfy-server` addition**: `defineResource({ model })` accepts a pre-made model.

## 2. Scope

### In scope
- New `rxfy-server` capability: `defineResource` accepts an optional `model` (use the shared rxfy model
  instead of deriving one from the table). Changeset + test.
- `examples/example-shared` package: shadcn UI (monorepo pattern) + theme CSS; shared Zod
  data (models/states/types/in-memory db+fetchers+`createComment`); shared read components +
  `BlogContext`/`BlogProvider`; `UpdatesBadge` (inert without a live client).
- Migrate all four examples to consume the shared package; each keeps its routing + SSR-seeding glue.
- The three plain examples gain Tailwind v4 + the shared shadcn theme; delete their local
  blog/components/CSS.

### Non-goals
- No visual/e2e tests (examples are demos). Gates stay `check-types` + `lint` + `build` per example
  (+ vite's server smoke test), plus a light data smoke test in the shared package.
- No change to each framework's SSR-seeding mechanism (Next `HydrationStream`, rr7 `entry.server`,
  waku `prefetch`+`HydrateSnapshot`, vite `entry-server`+grants) — only what they render moves to shared.
- Full interactive parity for the three plain examples (create/edit/delete posts) is NOT a goal; they
  get the shared read UI + add-comment. vite keeps its extras.
- No publishing (private example package).

## 3. Architecture

```
                         examples/example-shared  (workspace: examples-shared)
   ┌───────────────────────────────────────────────────────────────────────┐
   │ src/data     Zod models + states + types + in-memory db/fetchers        │  ← single source
   │ src/ui       shadcn primitives (button/card/input/textarea/badge/…)     │  ← shared look
   │ src/blog     PostList/PostItem/PostDetail/CommentItem/AddCommentForm     │  ← shared components
   │              + BlogProvider (navigate, onAddComment) + UpdatesBadge      │
   │ src/styles.css   Tailwind v4 + shadcn neutral theme                      │
   └───────────────────────────────────────────────────────────────────────┘
        ▲ consumed as SOURCE (each app's bundler transpiles; "use client" preserved)
        │
  ┌─────────────┬──────────────┬──────────────┬─────────────────────────────┐
  │ next-blog   │ rr7-blog     │ waku-blog    │ vite-blog-framework         │
  │ RSC + Hydr. │ RR7 SSR      │ Waku RSC     │ Vite SSR + Hono + live      │
  │ Stream      │ entry.server │ prefetch     │ entry-server + grants       │
  │ navigate:   │ navigate:    │ navigate:    │ navigate: history/pushState │
  │  router     │  router      │  router      │  (existing)                 │
  │ onAddComment│ onAddComment │ onAddComment │ onAddComment: live API      │
  │  : in-memory│  : in-memory │  : in-memory │  (POST /api/.../comments)   │
  └─────────────┴──────────────┴──────────────┴─────────────────────────────┘
```

Each example renders `<BlogProvider navigate onAddComment>{shared components}</BlogProvider>` inside its
own `StoreProvider` + routing, and imports `examples-shared/styles.css`.

## 4. The `rxfy-server` addition — `defineResource({ model })`

The shared client uses the shared Zod `postModel` (etc.). vite's live server must enumerate/broadcast
against that **same** model instance so grants and patches route into the shared store. Today
`defineResource` always derives a fresh model from the Drizzle table (a different instance).

Add an optional `model` to `defineResource`:

```ts
export function defineResource<TTable extends PgTable>(config: {
  table: TTable;
  name?: string;
  model?: ModelDescriptor<InferSelectModel<TTable>>; // NEW — use this instead of deriving
}): Resource<TTable> { … }
```

- If `model` is provided: `resource.model = config.model`, `resource.name = config.name ?? model.name ?? tableName`. The PK column is still detected from the table (drives SQL `where`).
- If omitted: unchanged (derive via drizzle-zod, current behavior).

Effect: vite does `defineResource({ table: posts, model: postModel /* shared */ })`. Then
`live.grant(registry, { entities: [postResource] })` reads `registry.model(sharedPostModel).valueEntries()`
— the store the SSR render populated — and `patch`/`stale` route by the shared model's name. The Drizzle
table still drives persistence (`live.create/update/delete` use `resource.table` + the PK column).

This is a minimal, backward-compatible change (new optional field). Tests: a resource with an injected
model exposes that exact model + correct name; live create/grant against it enumerate the injected
model's store. New changeset (`rxfy-server` minor).

## 5. Shared data (`src/data`)

The three plain examples' Zod layer is the source (convention: `userId`, comment `name`, `meta`):

```ts
// models.ts
export const UserIdSchema = z.string().brand("UserId"); // (+ PostId, CommentId)
export const UserSchema = z.object({ id: UserIdSchema, name: z.string(), email: z.string() });
export const PostSchema = z.object({ id: PostIdSchema, userId: UserIdSchema, title: z.string(), body: z.string() });
export const CommentSchema = z.object({ id: CommentIdSchema, postId: PostIdSchema, name: z.string(), body: z.string() });
export const userModel = createModel({ schema: UserSchema, getKey: (x) => x.id, name: "user" });
export const postModel = createModel({ schema: PostSchema, getKey: (x) => x.id, name: "post" });
export const commentModel = createModel({ schema: CommentSchema, getKey: (x) => x.id, name: "comment" });

// states.ts
export const postsState = defineState({
  key: "posts", params: z.object({}),
  model: { posts: array(postModel), authors: array(userModel), meta: z.object({ total: z.number(), generatedAt: z.string() }) },
});
export const postDetailState = defineState({
  key: "post-detail", params: z.object({ postId: PostIdSchema }),
  model: { post: single(postModel), author: single(userModel), comments: array(commentModel) },
  mutations: { addComment: (prev, comment: Comment) => ({ ...prev, comments: [...prev.comments, comment] }) },
});

// memory.ts — the in-memory db + fetchers + createComment (for next/rr7/waku)
export async function fetchPosts(): Promise<{ posts: Post[]; authors: User[]; meta: {…} }> { … }
export async function fetchPostDetail(p: { postId: PostId }): Promise<{ post; author; comments }> { … }
export function createComment(postId: PostId, name: string, body: string): Comment { … }
```

- **vite** imports the same `postModel`/`postsState`/etc. Its Drizzle schema uses `user_id` (JS `userId`)
  and comment `name`; `createdAt` remains an extra column (ignored by the shared type — the shared
  `Post` has no `createdAt`, and extra props on a stored entity are harmless). vite's `fetchPosts`
  computes `meta` server-side. vite does NOT use `memory.ts`.
- vite's `defineResource({ table, model: postModel })` (§4) ties the Drizzle table to the shared model.

## 6. Shared components + injection (`src/blog`)

- **`BlogProvider` / `useBlog`** — a context: `{ navigate: (path: string) => void; onAddComment: (postId: string, input: { name: string; body: string }) => void | Promise<void> }`. Links are plain `<a href onClick={e => { e.preventDefault(); navigate(href); }}>` (no per-framework `Link`).
- **`PostList`** — `useStateData(postsState, fetchFn, {})`; renders `UpdatesBadge`, optional `header?: ReactNode` slot (vite injects `NewPostForm`), the meta line, and `PostItem`s. `fetchFn` is provided via a prop/context (each example supplies its own — the 3 use `memory.ts`; vite uses its api-client). — **Note:** because `fetchFn` differs per example, it is passed to the shared `PostList`/`PostDetail` as a prop (alongside the context), OR carried on `BlogContext`. Decision: carry `fetchPosts`/`fetchPostDetail` on `BlogContext` too (so components read everything from one place).
- **`PostItem`** — `useModelStore(postModel).get(id)` + author; `Card` with a title link (via `navigate`); optional `actions?: ReactNode` slot (vite injects edit/delete).
- **`PostDetail`** — `useStateData(postDetailState, fetchFn, { postId })`; `UpdatesBadge` (noun "comment"); `Card` with post + author + comments + `AddCommentForm`; optional `actions?` slot.
- **`CommentItem`** — `useModelStore(commentModel).get(id)`; read-only card; optional `actions?` slot (vite injects delete).
- **`AddCommentForm`** — controlled name+body; on submit calls `useBlog().onAddComment(postId, { name, body })`.
- **`UpdatesBadge`** — `useObservable(updatesAvailable$, 0)`; renders a `Button` when `> 0`, else null. Without a live client `updatesAvailable$` is `of(0)` → always hidden (the 3). Live on vite.

`BlogContext` final shape: `{ navigate, onAddComment, fetchPosts, fetchPostDetail }`. The 3 wire
`memory.ts` fetchers + an in-memory `onAddComment` (calls `createComment` then the state's `addComment`
mutation / `reload`). vite wires its api-client fetchers + `onAddComment` (POST) — the live broadcast
refreshes other clients; the acting client sees it via the badge or an optimistic `reload`.

All shared components begin with `"use client"` (required by next/waku RSC; ignored by rr7/vite).

## 7. shadcn monorepo setup (`src/ui`, `src/styles.css`)

- Run `shadcn init` (neutral) **inside `examples/example-shared`** so it's the shadcn "ui" package;
  `add button card input textarea badge separator`. Its `components.json` uses the package's own `@/`
  → `examples/example-shared/src` alias (isolated to this package's tsconfig; the ui components import
  `@/lib/utils` which resolves within the package).
- `src/styles.css` holds the Tailwind entry + shadcn neutral theme + the `dark` variant. Apps
  `import "examples-shared/styles.css"` and add `@source` pointing at the shared src so Tailwind
  generates the classes used by shared components.
- Each consuming app has `@tailwindcss/vite`/PostCSS as its framework requires; the `@/` alias inside
  the shared package must NOT leak to apps — apps import the package by name (`examples-shared/...`), and
  the package's own bundler/tsconfig resolves its internal `@/`. (Consumed as source: each app's
  resolver must map `examples-shared` to the package; the package's internal `@/` is resolved by the
  app's TS `paths`/bundler using the package's own tsconfig `paths` — verified per app during migration;
  if `@/` leakage is a problem, the fallback is to rewrite the shared package's `@/` imports to relative,
  pinned in the plan.)

## 8. Per-example migration

Each keeps its **routing** and **SSR seeding**; only the rendered content + data defs move to shared.

- **next-blog** (RSC): delete `blog.ts`/components/`globals.css` blog rules; add Tailwind v4 + import
  `examples-shared/styles.css`; route pages render `<BlogProvider …><PostList/></BlogProvider>` (client
  wrapper); keep `HydrationStream` provider + `prefetch`-equivalent seeding. `navigate` uses
  `useRouter().push`.
- **rr7-blog**: same, `navigate` uses `useNavigate()`; keep `entry.server` dehydrate injection + loaders.
- **waku-blog**: same, `navigate` uses waku's router; keep `prefetch()` + `HydrateSnapshot`.
- **vite-blog-framework**: swap local `blog/` + `components/` for the shared ones; keep `api-client`,
  `server/*`, entries, `navigation.ts` (`navigate` from history API); `defineResource({ model })`; inject
  `NewPostForm`/edit/delete via the shared slots; wire `onAddComment` to the live API.

## 9. Testing & gates

- **examples-shared:** a light Vitest data smoke test (`fetchPosts`/`fetchPostDetail` return the seeded
  shape; `createComment` appends). `check-types` + `lint` + `build` (if built) — but as a source package
  it may only `check-types` + `lint`.
- **rxfy-server:** unit tests for `defineResource({ model })` (injected model + name; grant enumerates it).
- **Each example:** its existing `check-types` + `lint` + `build` gate (vite also its server smoke test).
  Manual acceptance = the four read views render the identical shadcn UI.

## 10. Phasing (each phase green)

1. **Framework tweak** — `defineResource({ model })` in `rxfy-server` + test + changeset.
2. **`examples/example-shared`** — scaffold (shadcn + theme + data + components + `BlogProvider`) +
   data smoke test. Buildable/lintable standalone.
3. **Migrate vite-blog-framework** — the proof (already shadcn + live). Full gates.
4. **Migrate next-blog, then rr7-blog, then waku-blog** — one at a time (Tailwind+theme, delete local
   files, render shared through `BlogProvider`, keep SSR/routing glue). Each ends green.

## 11. Self-review notes

- **Scope:** large but decomposed into 4 phases (framework tweak → shared package → vite → 3 plain),
  each independently green. Suitable for one plan with clearly-separated task groups, or split per phase.
- **Consistency:** single Zod data source; one shadcn theme; one component set injected via `BlogProvider`.
  The framework tweak is the linchpin that lets vite's live backend use the shared model.
- **Ambiguity resolved:** `fetchPosts`/`fetchPostDetail` are carried on `BlogContext` (not hardcoded);
  the `@/`-leakage risk for source consumption is flagged with a relative-imports fallback; `meta` is
  kept and vite provides it; vite's extras use optional `actions?`/`header?` slots.
- **Risk:** (a) consuming a shadcn-source package across four different bundlers (Next/Waku/RR/Vite) +
  Tailwind `@source` scanning — the plan verifies per app and pins the relative-imports fallback; (b) RSC
  `"use client"` in a shared source package — validated on next/waku during their migration.
