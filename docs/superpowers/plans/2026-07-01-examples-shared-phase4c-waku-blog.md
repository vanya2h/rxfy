# examples-shared Phase 4c — Migrate waku-blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `examples/waku-blog` (Waku 1.0.0-beta.3, RSC) onto `examples-shared` — shared shadcn UI + Zod models/states + read components — fetching via its own in-memory-backed Hono RPC client (`hc<AppType>`). Final example in the unification effort.

**Architecture:** waku-blog's local `src/blog.ts`/`src/db.ts`/components are replaced by `examples-shared/data` + shared components. Data lives in an in-memory `src/server/store.ts` (seeded from the shared seed) exposed by a Hono app (basePath `/api`) mounted through a **Waku auto-loaded middleware** (`src/middleware/api.ts`, which delegates `/api/*` to `app.fetch`). Waku keeps its RSC prefetch handoff: pages call `prefetch(state, fetchFn, params)` server-side and pass the dehydrated snapshot to `<HydrateSnapshot>` (unchanged `src/ssr.ts` + `HydrateSnapshot`); the shared `"use client"` components then read the hydrated store. As with next-blog (RSC), a fetcher function can't cross the server→client boundary, so thin `"use client"` view wrappers (`HomeView`/`PostView`) bind the fetchers. Per-example behavior (navigate via Waku's router, onAddComment via RPC) is injected through `BlogProvider`. Read + add-comment only (no live, no create/edit/delete).

**Tech Stack:** Waku 1.0.0-beta.3 (RSC, React 19), Hono + Hono RPC (`hc`) via a Waku middleware, Tailwind v4 via `@tailwindcss/postcss` + shadcn (from `examples-shared`), rxfy / rxfy-react (`StoreProvider` + `prefetch`/`HydrateSnapshot`), zod.

Spec: `docs/superpowers/specs/2026-07-01-examples-shared-design.md`. Phase 4c of 4. Depends on Phases 1–3 + 4a + 4b (merged). waku-blog current-state map + a Waku-Hono-mount investigation are in the conversation. Package `--filter` name: `rxfy-example-waku-blog`. Deps live in `dependencies` (not devDependencies) here (Waku bundles them for RSC).

## Key decisions

- **Hono mounted via `src/middleware/api.ts`** (Waku auto-loads `src/middleware/*.ts` as Hono middleware in dev AND build — no custom server entry). It delegates `/api/*` to a Hono app (`basePath("/api")`, `AppType`), giving the same typed `hc<AppType>("/")` → `client.api.posts.$get()` pattern as next/rr7. **Fallback:** if auto-load doesn't work in this beta, use a `src/waku.server.tsx` custom entry with `adapter(fsRouter(...), { middlewareFns: [...] })` (verified early in Task 2).
- **Waku's `_api/` file convention is NOT used** — it strips the `_api` prefix (→ `/posts`, colliding with page routes) and yields no Hono `AppType` for typed RPC.
- **RSC prefetch handoff preserved** (`src/ssr.ts` `prefetch` + `HydrateSnapshot` stay); the `"use client"` view wrappers solve the fetcher-prop boundary.
- **Tailwind via PostCSS** (`postcss.config.mjs` + `@tailwindcss/postcss`) — Waku uses Vite, which applies `postcss.config` automatically (same approach as next-blog).
- **Content = shared seed.**

---

## Task 1: Dependencies + Tailwind v4 / shadcn + theme

**Files:** `examples/waku-blog/package.json`, `postcss.config.mjs` (new), `src/styles.css`.

- [ ] **Step 1: dependencies** — READ `examples/waku-blog/package.json` (runtime deps live in `dependencies`). Add these to `dependencies` (alphabetical), matching the EXACT versions from `examples/vite-blog-framework/package.json` where they overlap (read it — `hono`, `tailwindcss`, and all shadcn runtime deps) and next-blog's `@tailwindcss/postcss` version:

```
"examples-shared": "workspace:*",
"hono": "^4.7.0",
"@fontsource-variable/geist": "^5.2.9",
"@tailwindcss/postcss": "^4.3.2",
"class-variance-authority": "^0.7.1",
"clsx": "^2.1.1",
"lucide-react": "^1.22.0",
"radix-ui": "^1.6.1",
"shadcn": "^4.12.0",
"tailwind-merge": "^3.6.0",
"tailwindcss": "^4.3.2",
"tw-animate-css": "^1.4.0"
```

(shadcn runtime deps must be direct deps because `examples-shared` is consumed as source and Waku/Vite resolves its imports from waku-blog's tree.)

- [ ] **Step 2: PostCSS config** — create `examples/waku-blog/postcss.config.mjs`:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 3: theme in `src/styles.css`** — replace the entire vanilla CSS with the shared shadcn theme. Copy the FULL contents of `examples/vite-blog-framework/src/styles.css` verbatim, then fix the ONE `@source` line for this file's location. `styles.css` is at `examples/waku-blog/src/styles.css` — the shared package is two levels up: `@source "../../example-shared/src/**/*.{ts,tsx}";` (src → waku-blog → examples, then into example-shared/src). Confirm with `ls examples/example-shared/src`. `src/pages/_layout.tsx` already does `import "../styles.css"`, so no other wiring needed. Keep everything else from vite's styles.css verbatim.

- [ ] **Step 4: install + verify** — `pnpm install`; `pnpm --filter rxfy-example-waku-blog check-types` → exit 0 (nothing consumes the shared package yet). Do NOT build yet.

- [ ] **Step 5: commit**

```bash
git add examples/waku-blog/package.json examples/waku-blog/postcss.config.mjs examples/waku-blog/src/styles.css pnpm-lock.yaml
git commit -m "chore(waku-blog): depend on examples-shared + tailwind v4/shadcn theme"
```

No `Co-Authored-By` trailer.

---

## Task 2: In-memory store + Hono app + Waku middleware mount (de-risk the mount early)

**Files (new):** `src/server/store.ts`, `src/server/app.ts`, `src/middleware/api.ts`.

- [ ] **Step 1: `src/server/store.ts`** — identical to next-blog/rr7 but a distinct global key. Use EXTENSIONLESS relative imports (the shared package convention; Vite/Waku resolve them):

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

const globalForStore = globalThis as unknown as { __wakuBlogStore?: Store };
const store: Store = (globalForStore.__wakuBlogStore ??= {
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

- [ ] **Step 2: `src/server/app.ts`** — Hono app (basePath `/api`) + `AppType`, `hono/validator` on the comment route (mirror vite/next/rr7):

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

- [ ] **Step 3: `src/middleware/api.ts`** — Waku auto-loads `src/middleware/*.ts` (default export = `() => MiddlewareHandler`). Delegate `/api/*` to the Hono app:

```ts
import type { MiddlewareHandler } from "hono";
import { app } from "../server/app";

const apiMiddleware = (): MiddlewareHandler => async (c, next) => {
  if (c.req.path.startsWith("/api/")) {
    return app.fetch(c.req.raw);
  }
  await next();
};

export default apiMiddleware;
```

> Verify the exact expected signature by reading `node_modules/waku/dist` for how `src/middleware/*` is loaded (the investigation found default-export `() => MiddlewareHandler`). If Waku's middleware loader expects a different shape (e.g. a named export, or a `(options) => MiddlewareHandler` receiving config), match it.

- [ ] **Step 4: DE-RISK — verify the mount works in dev BEFORE building the rest.** check-types first (`pnpm --filter rxfy-example-waku-blog check-types` → exit 0 for these files), then boot dev and probe `/api`:

```bash
cd /Users/vanya2h/Repos/rxfy/examples/waku-blog
pnpm dev > /tmp/waku-blog-dev.log 2>&1 &
sleep 10
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/waku-blog-dev.log | head -1 | grep -oE '[0-9]+$'); echo "port=$PORT"
echo "=== /api/posts ==="; curl -s "http://localhost:$PORT/api/posts" | head -c 400
echo; echo "=== log tail ==="; tail -20 /tmp/waku-blog-dev.log
pkill -f "waku dev" || true
```

EXPECT `/api/posts` to return JSON with `posts`/`authors`/`meta`.

- If it returns the JSON → the middleware mount works; proceed.
- **If it 404s / returns HTML / the middleware didn't load** → switch to the FALLBACK mount: delete `src/middleware/api.ts` and instead create `src/waku.server.tsx`:

  ```tsx
  import { fsRouter } from "waku";
  import adapter from "waku/adapters/node";
  import { app } from "./server/app";

  const apiMiddleware = () => async (c: any, next: any) => {
    if (c.req.path.startsWith("/api/")) return app.fetch(c.req.raw);
    await next();
  };

  export default adapter(fsRouter(import.meta.glob("./pages/**/*.{tsx,ts}")), {
    middlewareFns: [apiMiddleware],
  });
  ```

  Read `node_modules/waku/dist/adapters/node.d.ts` to confirm the `adapter` default export signature, the `middlewareFns` option name, and the `fsRouter` import path/signature; adjust the code to the real types (avoid `any` if the real `Context`/`Next` types are importable). Re-run the dev probe. Report which mount mechanism ended up working and the exact final code.

- [ ] **Step 5: commit** (commit whichever mount worked)

```bash
git add examples/waku-blog/src/server examples/waku-blog/src/middleware examples/waku-blog/src/waku.server.tsx 2>/dev/null; git commit -m "feat(waku-blog): in-memory store + Hono app mounted at /api"
```

(only the files that exist will be added.)

---

## Task 3: Typed RPC client + fetchers

**Files (new):** `src/blog/fetchers.ts`.

- [ ] **Step 1: `src/blog/fetchers.ts`** — typed `hc` client + `isServer` store read (used by RSC `prefetch`) + add-comment RPC (same shapes as next/rr7):

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

> The RSC `prefetch()` calls `fetchPosts`/`fetchPostDetail` server-side → the `isServer` branch reads the store directly. `import type { AppType }` is erased. Correct the `hc` accessor shape if `AppType` infers differently (should match next/rr7).

- [ ] **Step 2: verify + commit** — `pnpm --filter rxfy-example-waku-blog check-types` (server/fetcher files type-check; old components/pages may still error until Task 4). Commit:

```bash
git add examples/waku-blog/src/blog
git commit -m "feat(waku-blog): typed hc RPC client + fetchers"
```

---

## Task 4: Render shared components (providers, view wrappers, pages) + delete locals

**Files:** rewrite `src/providers.tsx`; new `src/components/HomeView.tsx`, `src/components/PostView.tsx`; rewrite `src/pages/index.tsx`, `src/pages/posts/[slug].tsx`; delete `src/blog.ts`, `src/db.ts`, `src/components/PostList.tsx`, `src/components/PostDetail.tsx`, `src/components/AddCommentForm.tsx`. KEEP `src/ssr.ts` and `src/components/HydrateSnapshot.tsx`.

- [ ] **Step 1: rewrite `src/providers.tsx`** — wrap in `BlogProvider` (navigate via Waku's router, onAddComment via RPC). FIRST verify Waku's client router API: check `node_modules/waku` exports for `useRouter` (likely `import { useRouter } from "waku"` returning `{ push(to), ... }`, or from `waku/router/client`). Use the real export.

```tsx
"use client";
import { useMemo } from "react";
import { useRouter } from "waku";
import { BlogProvider } from "examples-shared";
import { StoreProvider } from "rxfy-react";
import { addCommentRpc } from "./blog/fetchers";

export function RxfyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const blog = useMemo(
    () => ({
      navigate: (path: string) => router.push(path),
      onAddComment: (postId: string, input: { name: string; body: string }) => addCommentRpc(postId, input),
    }),
    [router],
  );
  return (
    <StoreProvider ssr>
      <BlogProvider value={blog}>{children}</BlogProvider>
    </StoreProvider>
  );
}
```

> If `useRouter` isn't exported from `"waku"`, find the correct import (`waku/router/client`) and/or the method name (`push` vs `navigate`) from the installed types and adjust. If Waku exposes no imperative router hook usable here, fall back to `navigate: (path) => { window.location.href = path; }` (full-page nav) and report — but prefer the client router.

- [ ] **Step 2: `src/components/HomeView.tsx`** (client wrapper):

```tsx
"use client";
import { PostList } from "examples-shared";
import { fetchPosts } from "../blog/fetchers";

export function HomeView() {
  return <PostList fetchPosts={fetchPosts} />;
}
```

- [ ] **Step 3: `src/components/PostView.tsx`** (client wrapper):

```tsx
"use client";
import { PostDetail } from "examples-shared";
import { type PostId } from "examples-shared/data";
import { fetchPostDetail } from "../blog/fetchers";

export function PostView({ postId }: { postId: PostId }) {
  return <PostDetail postId={postId} fetchPostDetail={fetchPostDetail} />;
}
```

- [ ] **Step 4: rewrite `src/pages/index.tsx`** (RSC — keep prefetch + HydrateSnapshot, render the client wrapper):

```tsx
import { postsState } from "examples-shared/data";
import { fetchPosts } from "../blog/fetchers";
import { HomeView } from "../components/HomeView";
import { HydrateSnapshot } from "../components/HydrateSnapshot";
import { prefetch } from "../ssr";

export default async function HomePage() {
  const snapshot = await prefetch(postsState, fetchPosts, {});
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <HomeView />
    </>
  );
}

export const getConfig = async () => {
  return { render: "static" } as const;
};
```

- [ ] **Step 5: rewrite `src/pages/posts/[slug].tsx`** (RSC):

```tsx
import type { PageProps } from "waku/router";
import { postDetailState, type PostId } from "examples-shared/data";
import { fetchPostDetail } from "../../blog/fetchers";
import { HydrateSnapshot } from "../../components/HydrateSnapshot";
import { PostView } from "../../components/PostView";
import { prefetch } from "../../ssr";

export default async function PostPage({ slug }: PageProps<"/posts/[slug]">) {
  const postId = slug as PostId;
  const snapshot = await prefetch(postDetailState, fetchPostDetail, { postId });
  return (
    <>
      <HydrateSnapshot snapshot={snapshot} />
      <PostView postId={postId} />
    </>
  );
}

export const getConfig = async () => {
  return { render: "dynamic" } as const;
};
```

- [ ] **Step 6: delete the now-shared locals**

```bash
git rm examples/waku-blog/src/blog.ts examples/waku-blog/src/db.ts \
       examples/waku-blog/src/components/PostList.tsx \
       examples/waku-blog/src/components/PostDetail.tsx \
       examples/waku-blog/src/components/AddCommentForm.tsx
```

Then confirm `src/ssr.ts` and `src/components/HydrateSnapshot.tsx` are UNTOUCHED and still valid (they import only from `rxfy`/`rxfy-react`, not from the deleted `./blog`). READ `src/pages/_layout.tsx` — it imports `RxfyProvider` from `../providers` (still valid) + `../styles.css` (still valid) + `Link` from `waku`; leave it unchanged unless it references a deleted module.

- [ ] **Step 7: verify (hard gate)** — `pnpm --filter rxfy-example-waku-blog check-types` → exit 0. `pnpm --filter rxfy-example-waku-blog exec eslint . --fix` then `pnpm --filter rxfy-example-waku-blog lint` → exit 0 (bare; verify real exit code, don't pipe through `tail`). No dangling refs: `grep -rn "from \"../blog\"\|from \"../../blog\"\|from \"./blog\"\|from \"../db\"\|from \"./db\"\|components/PostList\|components/PostDetail\|components/AddCommentForm" examples/waku-blog/src` → EMPTY except the new `../blog/fetchers` / `../../blog/fetchers` imports.

- [ ] **Step 8: commit**

```bash
git add examples/waku-blog/src
git commit -m "feat(waku-blog): render shared components via BlogProvider + view wrappers"
```

---

## Task 5: Build + runtime SSR smoke

- [ ] **Step 1: type-check + lint + build gate**
  - `pnpm --filter rxfy-example-waku-blog check-types` → exit 0.
  - `pnpm --filter rxfy-example-waku-blog lint` → exit 0 (bare).
  - `pnpm --filter rxfy-example-waku-blog build` → the Waku production build (`waku build`) must succeed. This is the key RSC integration gate: it exercises Waku/Vite processing the `examples-shared` source (incl. `"use client"` boundaries), Tailwind via PostCSS scanning the shared package, and bundling the Hono middleware. Capture the result / exact error. If it fails on `"use client"`/RSC boundary handling of the shared components, or on resolving the shadcn runtime deps, report the exact error.

- [ ] **Step 2: runtime SSR smoke (dev)** — boot dev and probe:

```bash
cd /Users/vanya2h/Repos/rxfy/examples/waku-blog
pnpm dev > /tmp/waku-blog-dev.log 2>&1 &
sleep 12
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/waku-blog-dev.log | head -1 | grep -oE '[0-9]+$'); echo "port=$PORT"
echo "=== /api/posts ==="; curl -s "http://localhost:$PORT/api/posts" | head -c 500
echo; echo "=== home SSR: seeded title count ==="; curl -s "http://localhost:$PORT/" | grep -oc 'Getting Started with rxfy'
echo "=== detail SSR (/posts/1): title count ==="; curl -s "http://localhost:$PORT/posts/1" | grep -oc 'Getting Started with rxfy'
echo "=== home SSR: shadcn class present? ==="; curl -s "http://localhost:$PORT/" | grep -oc 'text-muted-foreground'
echo "=== dev log tail ==="; tail -40 /tmp/waku-blog-dev.log
pkill -f "waku dev" || true
```

Assert and REPORT actual values:

- `/api/posts` returns JSON with `posts`, `authors`, `meta.total` (the Hono middleware mount works).
- Home `/` SSR HTML contains the seeded title `Getting Started with rxfy` ≥1 (RSC prefetch + `HydrateSnapshot` + shared `PostList` render — the crux).
- `/posts/1` SSR HTML contains the post title (shared `PostDetail` via prefetch).
- A shadcn class (`text-muted-foreground`, or note other clearly-present shadcn/Tailwind classes) appears (Tailwind scanned the shared package).
- Dev log clean (no RSC `"use client"` errors, unresolved-module, `examples-shared` resolution failures, or hydration mismatches).
  Then confirm the dev server stopped (port free). If the seeded title is absent from SSR HTML, inspect the log and report verbatim.

- [ ] **Step 3: production start smoke (optional but recommended for RSC)** — since Waku's dev and build paths differ, also verify the built app serves: `pnpm --filter rxfy-example-waku-blog build` (from Step 1) then start it and probe once:

```bash
cd /Users/vanya2h/Repos/rxfy/examples/waku-blog
pnpm start > /tmp/waku-blog-start.log 2>&1 &
sleep 8
PORT=$(grep -oE 'localhost:[0-9]+' /tmp/waku-blog-start.log | head -1 | grep -oE '[0-9]+$'); echo "port=$PORT"
curl -s "http://localhost:$PORT/api/posts" | head -c 200
echo; curl -s "http://localhost:$PORT/posts/1" | grep -oc 'Getting Started with rxfy'
tail -15 /tmp/waku-blog-start.log
pkill -f "waku start" || true
```

Report whether the production server also serves `/api/posts` + renders the shared components. If `waku start` behaves differently from dev (e.g. the middleware mount only worked in dev), report it — that would indicate the mount mechanism needs the `waku.server.tsx` fallback for production. (If `waku start` is flaky/unsupported in this beta in the sandbox, note that and rely on the dev smoke + successful build.)

- [ ] **Step 4: monorepo gate + no-regression** — `pnpm turbo check-types lint build --filter=rxfy-example-waku-blog` → all pass. Also `pnpm turbo check-types --filter=examples-shared` and quick `check-types` on `rxfy-example-next-blog` + `rxfy-example-rr7-blog` (Phases 4a/4b unaffected).

- [ ] **Step 5: commit** (empty phase-closer if nothing else changed)

```bash
git commit --allow-empty -m "chore(waku-blog): finalize shared-package migration + verify build/SSR"
```

---

## Self-Review Notes

- **Spec coverage:** waku-blog consumes `examples-shared` (shadcn UI + shared models/states + read components), fetches via its OWN Hono RPC client (`hc<AppType>`) mounted through a Waku middleware, and injects behavior via `BlogProvider` (navigate through Waku's router, onAddComment through RPC). Content = shared seed. Read + add-comment only. All four examples now "look the same".
- **RSC integration correctness:** Waku's `prefetch` + `HydrateSnapshot` handoff is preserved (server prefetch reads the store; snapshot hydrates the client store); `"use client"` view wrappers (`HomeView`/`PostView`) solve the fetcher-prop boundary; `import type { AppType }` is erased so no server code enters the client bundle; Tailwind via PostCSS scans the shared package.
- **Riskiest area (Hono mount) is de-risked early** (Task 2 Step 4 runtime probe) with a documented `waku.server.tsx` fallback, and re-checked under `waku build`/`start` (Task 5 Step 3) because Waku's dev and prod paths differ.
- **Reuses proven pieces:** store/app/fetchers are the next/rr7 shapes; `examples-shared` is extensionless (Phase 4a) so no bundler-resolution surprises; optimistic add-comment (Phase 4a shared refinement) makes new comments appear without live updates.
- **Known-risk flags with fallbacks:** Waku middleware auto-load vs `waku.server.tsx` (Task 2); `useRouter` export/method for navigate (Task 4 Step 1); Waku build RSC handling of the shared source (Task 5). Each has a verification or fallback.
- **Completes Phase 4 / the whole effort:** vite (live) + next + rr7 + waku all render the shared shadcn components from `examples-shared` over their own Hono RPC clients.
