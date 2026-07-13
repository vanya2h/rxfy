# examples-shared Phase 4b — Migrate rr7-blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `examples/rr7-blog` (React Router 7, SSR) onto `examples-shared` — shared shadcn UI + Zod models/states + read components — fetching via its own in-memory-backed Hono RPC client (`hc<AppType>`). Replicates the Phase 4a next-blog reference for a Vite-based classic-SSR framework.

**Architecture:** rr7-blog's local `app/blog.ts`/`app/db.ts`/components are replaced by `examples-shared/data` + shared components. Data lives in an in-memory `app/server/store.ts` (seeded from the shared seed) exposed by a Hono app (basePath `/api`) mounted through a **React Router resource route** (`app/routes/api.$.tsx`, a splat route whose `loader`/`action` delegate to `app.fetch`). The client fetches via a typed `hc<AppType>` client; the server (SSR render) reads the store directly (`isServer` branch) — mirroring vite/next. Unlike the RSC examples, rr7 is classic SSR, so route modules render the shared components with fetchers passed directly (no `"use client"` view wrappers needed). Per-example behavior (navigate via `useNavigate`, onAddComment via RPC) is injected through `BlogProvider` in `root.tsx`'s `App`. Read + add-comment only (no live, no create/edit/delete).

**Tech Stack:** React Router 7 (framework mode, Vite), Hono + Hono RPC (`hc`) via a resource route, Tailwind v4 via `@tailwindcss/vite` + shadcn (from `examples-shared`), rxfy / rxfy-react (`StoreProvider` + `hydrationScript`/`dehydrate` in `entry.server`/`entry.client`), zod.

Spec: `docs/superpowers/specs/2026-07-01-examples-shared-design.md`. Phase 4b of 4. Depends on Phases 1–3 + 4a (merged). rr7-blog current-state map is in the conversation. Package `--filter` name: `rxfy-example-rr7-blog`.

## Key decisions

- **Vite bundler** → use `@tailwindcss/vite` + `ssr.noExternal: ["examples-shared"]` (exactly like `vite-blog-framework`). No Turbopack, so no `.js`-remap issue — but `examples-shared` is already extensionless, which is fine everywhere.
- **Hono via a resource route** (`app/routes/api.$.tsx`): RR7 resource routes export `loader`/`action` (no default component) and return a raw `Response`; delegating to `app.fetch(request)` mounts the whole Hono app at `/api/*`. The app's `basePath("/api")` matches.
- **No view wrappers** (classic SSR, not RSC) — route components pass fetchers directly to shared components.
- **Content = shared seed** (same as next-blog).

---

## Task 1: Dependencies + Tailwind v4 / shadcn + Vite config

**Files:** `examples/rr7-blog/package.json`, `vite.config.ts`, `app/app.css`.

- [ ] **Step 1: dependencies** — READ `examples/rr7-blog/package.json` (deps live in `devDependencies`). Add these (alphabetical), matching the EXACT versions in `examples/vite-blog-framework/package.json` where they overlap (read it and copy — `hono`, `@tailwindcss/vite`, `tailwindcss`, and all shadcn runtime deps):

```
"examples-shared": "workspace:*",
"hono": "^4.7.0",
"@fontsource-variable/geist": "^5.2.9",
"@tailwindcss/vite": "^4.3.2",
"class-variance-authority": "^0.7.1",
"clsx": "^2.1.1",
"lucide-react": "^1.22.0",
"radix-ui": "^1.6.1",
"shadcn": "^4.12.0",
"tailwind-merge": "^3.6.0",
"tailwindcss": "^4.3.2",
"tw-animate-css": "^1.4.0"
```

(The shadcn runtime deps must be declared here because `examples-shared` is consumed as source and Vite resolves its imports from rr7-blog's tree.)

- [ ] **Step 2: `vite.config.ts`** — add the Tailwind v4 plugin and make Vite process the source package. Final file:

```ts
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  ssr: {
    noExternal: ["examples-shared"],
  },
});
```

- [ ] **Step 3: `app/app.css`** — replace the entire vanilla CSS with the shared shadcn theme. Copy the FULL contents of `examples/vite-blog-framework/src/styles.css` verbatim, then fix the ONE `@source` line for this file's location. `app/app.css` is at `examples/rr7-blog/app/app.css` — the shared package is two levels up: `@source "../../example-shared/src/**/*.{ts,tsx}";` (from `app/` → `rr7-blog/` → `examples/`, then into `example-shared/src`). Confirm with `ls examples/example-shared/src`. `root.tsx` already does `import "./app.css"`, so no other wiring is needed. Keep everything else from vite's styles.css verbatim.

- [ ] **Step 4: install + verify** — `pnpm install`; `pnpm --filter rxfy-example-rr7-blog check-types` → exit 0 (nothing consumes the shared package yet; `check-types` runs `react-router typegen && tsc --noEmit`).

- [ ] **Step 5: commit**

```bash
git add examples/rr7-blog/package.json examples/rr7-blog/vite.config.ts examples/rr7-blog/app/app.css pnpm-lock.yaml
git commit -m "chore(rr7-blog): depend on examples-shared + tailwind v4/shadcn theme"
```

No `Co-Authored-By` trailer.

---

## Task 2: In-memory store + Hono app + resource route + fetchers

**Files (new):** `app/server/store.ts`, `app/server/app.ts`, `app/routes/api.$.tsx`, `app/blog/fetchers.ts`; **edit** `app/routes.ts`.

- [ ] **Step 1: `app/server/store.ts`** (identical logic to next-blog):

```ts
import {
  type Comment,
  type CommentId,
  type Post,
  type PostId,
  seedComments,
  seedPosts,
  seedUsers,
  type User,
} from "examples-shared/data";

type Store = { users: User[]; posts: Post[]; comments: Comment[]; nextCommentId: number };

const globalForStore = globalThis as unknown as { __rr7BlogStore?: Store };
const store: Store = (globalForStore.__rr7BlogStore ??= {
  users: [...seedUsers],
  posts: [...seedPosts],
  comments: [...seedComments],
  nextCommentId: seedComments.length + 1,
});

export function listPosts(): { posts: Post[]; authors: User[]; meta: { total: number; generatedAt: string } } {
  const authorIds = new Set(store.posts.map((p) => p.userId));
  const authors = store.users.filter((u) => authorIds.has(u.id));
  return { posts: store.posts, authors, meta: { total: store.posts.length, generatedAt: new Date().toISOString() } };
}

export function getPostDetail(postId: PostId): { post: Post; author: User; comments: Comment[] } | undefined {
  const post = store.posts.find((p) => p.id === postId);
  if (!post) return undefined;
  const author = store.users.find((u) => u.id === post.userId);
  if (!author) return undefined;
  const comments = store.comments.filter((c) => c.postId === postId);
  return { post, author, comments };
}

export function addComment(postId: PostId, input: { name: string; body: string }): Comment {
  const comment: Comment = {
    id: String(store.nextCommentId++) as CommentId,
    postId,
    name: input.name,
    body: input.body,
  };
  store.comments = [...store.comments, comment];
  return comment;
}
```

- [ ] **Step 2: `app/server/app.ts`** (Hono app; use `hono/validator` on the comment route so the RPC body types, matching vite/next):

```ts
import { type PostId } from "examples-shared/data";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { addComment, getPostDetail, listPosts } from "./store";

export const app = new Hono()
  .basePath("/api")
  .get("/posts", (c) => c.json(listPosts()))
  .get("/posts/:id", (c) => {
    const detail = getPostDetail(c.req.param("id") as PostId);
    if (!detail) return c.json({ error: "not found" }, 404);
    return c.json(detail);
  })
  .post(
    "/posts/:id/comments",
    validator("json", (value) => value as { name: string; body: string }),
    (c) => {
      const { name, body } = c.req.valid("json");
      const comment = addComment(c.req.param("id") as PostId, { name, body });
      return c.json(comment);
    },
  );

export type AppType = typeof app;
```

> Confirm the exact `hono/validator` usage against `examples/vite-blog-framework/server/api.ts` (the Phase-3 implementer used it there) and match it. Note: relative imports here are extensionless (`./store`) — Vite/RR7 resolve both, but keep consistent with the store file's own style.

- [ ] **Step 3: `app/routes/api.$.tsx`** (resource route mounting the Hono app at `/api/*`):

```tsx
import { app } from "../server/app";
import type { Route } from "./+types/api.$";

export const loader = ({ request }: Route.LoaderArgs) => app.fetch(request);
export const action = ({ request }: Route.ActionArgs) => app.fetch(request);
```

> A resource route exports `loader`/`action` and NO default component, so RR7 returns the raw `Response` from `app.fetch`. If `react-router typegen` doesn't generate `./+types/api.$` for a splat resource route (or the `Route.LoaderArgs` type isn't available), fall back to importing the arg types directly: `import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";` and type as `({ request }: LoaderFunctionArgs)` / `({ request }: ActionFunctionArgs)`. Report which you used.

- [ ] **Step 4: register the route in `app/routes.ts`** — add the splat route:

```ts
import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("posts", "routes/posts.tsx"),
  route("posts/:postId", "routes/posts.$postId.tsx"),
  route("api/*", "routes/api.$.tsx"),
] satisfies RouteConfig;
```

- [ ] **Step 5: `app/blog/fetchers.ts`** (typed `hc` client + `isServer` store read + add-comment RPC):

```ts
import { type Comment, type CommentId, type PostDetailData, type PostId, type PostsData } from "examples-shared";
import { hc } from "hono/client";
import type { AppType } from "../server/app";

const isServer = typeof window === "undefined";
const client = hc<AppType>("/");

export async function fetchPosts(): Promise<PostsData> {
  if (isServer) {
    const { listPosts } = await import("../server/store");
    return listPosts() as unknown as PostsData;
  }
  const res = await client.api.posts.$get();
  return (await res.json()) as unknown as PostsData;
}

export async function fetchPostDetail({ postId }: { postId: PostId }): Promise<PostDetailData> {
  if (isServer) {
    const { getPostDetail } = await import("../server/store");
    const detail = getPostDetail(postId);
    if (!detail) throw new Error(`Post "${postId}" not found`);
    return detail as unknown as PostDetailData;
  }
  const res = await client.api.posts[":id"].$get({ param: { id: postId } });
  if (!res.ok) throw new Error(`Post "${postId}" not found`);
  return (await res.json()) as unknown as PostDetailData;
}

export async function addCommentRpc(postId: string, input: { name: string; body: string }): Promise<Comment> {
  const res = await client.api.posts[":id"].comments.$post({ param: { id: postId }, json: input });
  const created = (await res.json()) as { id: string; postId: string; name: string; body: string };
  return { id: created.id as CommentId, postId: created.postId as PostId, name: created.name, body: created.body };
}
```

> `import type { AppType }` is erased; the server branch dynamic-imports the store, so no server code enters the client bundle. Correct the `hc` accessor shape if `AppType` infers it differently (it shouldn't — same app shape as next-blog).

- [ ] **Step 6: verify** — `pnpm --filter rxfy-example-rr7-blog check-types` → the server/route/fetcher files type-check (old components may still error until Task 3). Confirm the resource route + `hc` calls resolve.

- [ ] **Step 7: commit**

```bash
git add examples/rr7-blog/app/server examples/rr7-blog/app/routes/api.$.tsx examples/rr7-blog/app/routes.ts examples/rr7-blog/app/blog
git commit -m "feat(rr7-blog): in-memory store + Hono app via resource route + hc fetchers"
```

---

## Task 3: Render shared components + BlogProvider; delete locals

**Files:** edit `app/root.tsx`, `app/routes/posts.tsx`, `app/routes/posts.$postId.tsx`; delete `app/blog.ts`, `app/db.ts`, `app/components/PostList.tsx`, `app/components/PostDetail.tsx`, `app/components/AddCommentForm.tsx`.

- [ ] **Step 1: `app/root.tsx`** — wrap the `Outlet` in `BlogProvider` (navigate via `useNavigate`, which is available because `App` renders inside the router). Keep `Layout` unchanged. Rewrite the default `App`:

```tsx
import { useMemo } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useNavigate } from "react-router";
import { BlogProvider } from "examples-shared";
import { addCommentRpc } from "./blog/fetchers";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>rxfy + React Router 7</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div className="container mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">{children}</div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const navigate = useNavigate();
  const blog = useMemo(
    () => ({
      navigate: (path: string) => navigate(path),
      onAddComment: (postId: string, input: { name: string; body: string }) => addCommentRpc(postId, input),
    }),
    [navigate],
  );
  return (
    <BlogProvider value={blog}>
      <Outlet />
    </BlogProvider>
  );
}
```

(The `.container` class had vanilla styling before; since app.css is now the shadcn theme, the added Tailwind utility classes give it a comparable centered layout. Keep or adjust to taste — the important part is the `BlogProvider` wrapper.)

- [ ] **Step 2: `app/routes/posts.tsx`** — render the shared `PostList` with the fetcher directly (classic SSR, no wrapper needed):

```tsx
import { PostList } from "examples-shared";
import { fetchPosts } from "../blog/fetchers";

export default function PostsRoute() {
  return <PostList fetchPosts={fetchPosts} />;
}
```

- [ ] **Step 3: `app/routes/posts.$postId.tsx`** — keep the loader's cheap URL validation, repoint the `PostId` import to the shared package, and render the shared `PostDetail`:

```tsx
import { type PostId } from "examples-shared/data";
import { PostDetail } from "examples-shared";
import { fetchPostDetail } from "../blog/fetchers";
import type { Route } from "./+types/posts.$postId";

export function loader({ params }: Route.LoaderArgs) {
  if (!/^\d+$/.test(params.postId)) {
    throw new Response("Not Found", { status: 404 });
  }
  return { postId: params.postId as PostId };
}

export default function PostDetailRoute({ loaderData }: Route.ComponentProps) {
  return <PostDetail postId={loaderData.postId} fetchPostDetail={fetchPostDetail} />;
}
```

- [ ] **Step 4: delete the now-shared locals**

```bash
git rm examples/rr7-blog/app/blog.ts examples/rr7-blog/app/db.ts \
       examples/rr7-blog/app/components/PostList.tsx \
       examples/rr7-blog/app/components/PostDetail.tsx \
       examples/rr7-blog/app/components/AddCommentForm.tsx
```

Then READ `app/routes/_index.tsx`, `app/entry.server.tsx`, `app/entry.client.tsx`. If any import a deleted module (`./blog`, `../blog`, `./db`, or a deleted component), repoint to `examples-shared/data` or fix minimally. `_index.tsx` is likely just a redirect to `/posts` (no data import); the entries wrap `StoreProvider` and shouldn't import blog data — but verify and report.

- [ ] **Step 5: verify (hard gate)** — `pnpm --filter rxfy-example-rr7-blog check-types` → exit 0. `pnpm --filter rxfy-example-rr7-blog exec eslint . --fix` then `pnpm --filter rxfy-example-rr7-blog lint` → exit 0 (bare command; verify the real exit code, do NOT pipe through `tail`). No dangling refs: `grep -rn "from \"../blog\"\|from \"./blog\"\|from \"../db\"\|from \"./db\"\|components/PostList\|components/PostDetail\|components/AddCommentForm" examples/rr7-blog/app` → should be EMPTY except the new `./blog/fetchers` / `../blog/fetchers` imports.

- [ ] **Step 6: commit**

```bash
git add examples/rr7-blog/app
git commit -m "feat(rr7-blog): render shared components via BlogProvider"
```

---

## Task 4: Build + runtime SSR smoke

- [ ] **Step 1: type-check + lint + build gate**
  - `pnpm --filter rxfy-example-rr7-blog check-types` → exit 0.
  - `pnpm --filter rxfy-example-rr7-blog lint` → exit 0 (bare).
  - `pnpm --filter rxfy-example-rr7-blog build` → the React Router production build (`react-router build` — builds client + SSR bundles) must succeed. This exercises Vite processing the `examples-shared` source (`ssr.noExternal`) + Tailwind scanning it. Capture the result / any error.

- [ ] **Step 2: runtime SSR smoke** — start the dev server in the background and probe. RR7 dev default port is 5173 (Vite); read the actual port from the log if different:

```bash
cd /Users/vanya2h/Repos/rxfy/examples/rr7-blog
pnpm dev > /tmp/rr7-blog-dev.log 2>&1 &
sleep 8
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/rr7-blog-dev.log | head -1 | grep -oE '[0-9]+$'); echo "port=$PORT"
echo "=== /api/posts ==="; curl -s "http://localhost:$PORT/api/posts" | head -c 500
echo; echo "=== /posts SSR: seeded title count ==="; curl -s "http://localhost:$PORT/posts" | grep -oc 'Getting Started with rxfy'
echo "=== /posts/1 SSR: title count ==="; curl -s "http://localhost:$PORT/posts/1" | grep -oc 'Getting Started with rxfy'
echo "=== /posts SSR: shadcn class present? ==="; curl -s "http://localhost:$PORT/posts" | grep -oc 'text-muted-foreground'
echo "=== dev log tail ==="; tail -30 /tmp/rr7-blog-dev.log
```

Assert and REPORT actual values:

- `/api/posts` returns JSON with `posts`, `authors`, `meta.total` (Hono resource route works).
- `/posts` SSR HTML contains the seeded title `Getting Started with rxfy` ≥1 (shared `PostList` renders server-side through the shared store).
- `/posts/1` SSR HTML contains the post title (shared `PostDetail` renders).
- A shadcn class (`text-muted-foreground`) appears somewhere (Tailwind scanned the shared package).
- Dev log clean (no unresolved-module / SSR exception / hydration-mismatch).
  Then stop the dev server: `pkill -f "react-router dev" || pkill -f rr7-blog || true`; confirm stopped. If the seeded title is absent from SSR, inspect the log and report verbatim.

- [ ] **Step 3: monorepo gate** — `pnpm turbo check-types lint build --filter=rxfy-example-rr7-blog` → all pass. Also `pnpm turbo check-types --filter=examples-shared` (unaffected) and a quick `pnpm turbo check-types --filter=rxfy-example-next-blog` (Phase 4a unaffected).

- [ ] **Step 4: commit** (empty phase-closer if nothing else changed)

```bash
git commit --allow-empty -m "chore(rr7-blog): finalize shared-package migration + verify build/SSR"
```

---

## Self-Review Notes

- **Spec coverage:** rr7-blog consumes `examples-shared` (shadcn UI + shared models/states + read components), fetches via its OWN Hono RPC client (`hc<AppType>`) mounted through a React Router resource route, and injects behavior via `BlogProvider` (navigate through `useNavigate`, onAddComment through RPC). Content = shared seed. Read + add-comment only.
- **Framework-specific integration:** Hono mounted via a splat resource route (`api.$.tsx` → `app.fetch`); Tailwind via `@tailwindcss/vite` + `ssr.noExternal` (Vite, same as vite-blog-framework); classic SSR means route components pass fetchers directly (no RSC view wrappers); `BlogProvider` sits inside the router in `root.tsx`'s `App` so `useNavigate` is valid; SSR fetch uses the `isServer` store branch, client uses `hc`.
- **Reuses proven pieces:** the store, Hono app (+`hono/validator`), and fetchers are the next-blog shapes; `examples-shared` is already extensionless (Phase 4a) so no bundler-resolution surprises. The optimistic add-comment (shared `onAdded` + `addComment` mutation, Phase 4a Task 1) makes new comments appear without live updates.
- **Known-risk flags with fallbacks:** resource-route typegen (`./+types/api.$` vs plain `LoaderFunctionArgs`, Task 2 Step 3); `hc` accessor shape (Task 2 Step 5); build transpile of the source package (Task 4 Step 1). Each has a verification.
- **Out of scope (Phase 4c):** waku-blog (Waku RSC — Hono mount + `prefetch`/`HydrateSnapshot` handoff + `"use client"` view wrappers like next-blog).
