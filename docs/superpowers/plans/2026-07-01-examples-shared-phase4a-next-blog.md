# examples-shared Phase 4a — Shared refinement + migrate next-blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) A small backward-compatible refinement to `examples-shared` so add-comment reflects in non-live examples (an `addComment` state mutation applied optimistically). (2) Migrate `examples/next-blog` (Next.js 16 App Router) onto `examples-shared` — shared shadcn UI + Zod models/states + read components — fetching via its own in-memory-backed Hono RPC client (`hc<AppType>`). This is the RSC reference migration; rr7-blog and waku-blog replicate it in Phases 4b/4c.

**Architecture:** next-blog's local `blog.ts`/`db.ts`/components are replaced by `examples-shared/data` + shared components. Data lives in a per-example in-memory `store.ts` (seeded from the shared seed) exposed by a Hono app mounted at a Next catch-all route handler (`app/api/[[...route]]/route.ts`); the client fetches through a typed `hc<AppType>` client and the server (RSC render) reads the store directly (mirrors vite's `isServer` branch). Because a fetcher function can't cross the RSC server→client boundary as a prop, thin `"use client"` view wrappers bind the fetchers to the shared components. Per-example behavior (navigate via `next/navigation`, onAddComment via RPC) is injected through `BlogProvider`. These examples are read + add-comment only (no create/edit/delete, no live/websocket).

**Tech Stack:** Next.js 16 (App Router, React 19 RSC), Hono + Hono RPC (`hc`) mounted via a catch-all route handler, Tailwind v4 via `@tailwindcss/postcss` + shadcn (from `examples-shared`), rxfy / rxfy-react (`/next` `HydrationStream`), zod.

Spec: `docs/superpowers/specs/2026-07-01-examples-shared-design.md`. Phase 4a of 4. Depends on Phases 1–3 (merged). Current-state maps of next-blog and the shared package are in the conversation.

## Key decisions
- **Shared refinement (Task 1) is backward-compatible with vite (Phase 3):** adding an `addComment` mutation to `postDetailState` and an optional `onAdded` on the shared `AddCommentForm` doesn't change vite's behavior (vite's `onAddComment` returns `void`, so `onAdded` never fires — vite keeps relying on its live refetch). Re-verified in Task 1.
- **Content unified via the shared seed:** next-blog's in-memory store seeds from `examples-shared`'s `seedUsers`/`seedPosts`/`seedComments` (so all examples show the same content — part of "look the same").
- **Client fetches via `hc`; RSC/SSR reads the store directly** (`isServer` branch), same split as vite.
- **RSC function-prop constraint** handled with `"use client"` view wrappers (`HomeView`/`PostView`) that import the fetchers and render the shared components.

---

## Task 1: Shared refinement — optimistic add-comment (`examples-shared`)

**Files:** `examples/example-shared/src/data/states.ts`, `examples/example-shared/src/blog/AddCommentForm.tsx`, `examples/example-shared/src/blog/PostDetail.tsx`. Re-verify vite.

- [ ] **Step 1: add the `addComment` mutation to `postDetailState`** — edit `examples/example-shared/src/data/states.ts`. Import the `Comment` type and add a `mutations` block so the state can apply a new comment optimistically (rxfy re-normalizes the returned denormalized shape — the full `Comment` entity goes into the `comment` store and its id appends to the query's `comments` array):
```ts
import { array, defineState, single } from "rxfy";
import { z } from "zod";
import { commentModel, type Comment, PostIdSchema, postModel, userModel } from "./models.js";

export const postsState = defineState({
  key: "posts",
  params: z.object({}),
  model: {
    posts: array(postModel),
    authors: array(userModel),
    meta: z.object({ total: z.number(), generatedAt: z.string() }),
  },
});

export const postDetailState = defineState({
  key: "post-detail",
  params: z.object({ postId: PostIdSchema }),
  model: { post: single(postModel), author: single(userModel), comments: array(commentModel) },
  mutations: {
    addComment: (prev, comment: Comment) => ({ ...prev, comments: [...prev.comments, comment] }),
  },
});
```
> This mirrors the mutation next/rr7/waml already used pre-migration. If `defineState`'s `mutations` typing wants the `prev` shape spelled differently, match the shape rxfy infers (the `comments` field in the mutation's `prev` is the raw `Comment[]`, since mutations run on the denormalized result then re-normalize). Verify against how the pre-migration `next-blog/src/blog.ts` typed it (identical) and against `packages/rxfy` `defineState` types.

- [ ] **Step 2: `AddCommentForm` gains an optional `onAdded`** — edit `examples/example-shared/src/blog/AddCommentForm.tsx`. After persisting, if the persist call returned the created comment, apply it via `onAdded`:
```tsx
"use client";
import { useState } from "react";
import { type Comment } from "../data/models.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import { useBlog } from "./BlogContext.js";

export function AddCommentForm({ postId, onAdded }: { postId: string; onAdded?: (comment: Comment) => void }) {
  const { onAddComment } = useBlog();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    const created = await onAddComment(postId, { name: name.trim(), body: body.trim() });
    if (created && onAdded) onAdded(created);
    setName("");
    setBody("");
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your comment…" />
      <Button type="submit" size="sm" className="self-start">Post comment</Button>
    </form>
  );
}
```

- [ ] **Step 3: widen `onAddComment` return + thread the mutation in `PostDetail`** — edit `examples/example-shared/src/blog/BlogContext.tsx` so `onAddComment` may return the created comment:
```tsx
"use client";
import { createContext, useContext, type ReactNode } from "react";
import { type Comment } from "../data/models.js";

export type BlogContextValue = {
  navigate: (path: string) => void;
  onAddComment: (postId: string, input: { name: string; body: string }) => void | Comment | Promise<void | Comment>;
};

const BlogContext = createContext<BlogContextValue | null>(null);

export function BlogProvider({ value, children }: { value: BlogContextValue; children: ReactNode }) {
  return <BlogContext.Provider value={value}>{children}</BlogContext.Provider>;
}

export function useBlog(): BlogContextValue {
  const ctx = useContext(BlogContext);
  if (!ctx) throw new Error("BlogProvider not found");
  return ctx;
}
```
Then edit `examples/example-shared/src/blog/PostDetail.tsx` to pass `handle.mutations.addComment` down to the `AddCommentForm` via the inner `Article`. Changes ONLY: (a) capture the mutation from the handle; (b) add an `onAdded` prop to `Article`; (c) pass it to `AddCommentForm`. Concretely — in `PostDetail`, the `useStateData` call already returns `handle`; render `<Article ids={ids} actions={actions} renderCommentActions={renderCommentActions} onAdded={handle.mutations.addComment} />`. In `Article`, add `onAdded` to its props type (`onAdded?: (comment: Comment) => void`) and render `<AddCommentForm postId={post.id} onAdded={onAdded} />`. Import `type Comment` from `../data/models.js` if not already imported.
> `handle.mutations.addComment` exists now that `postDetailState` defines the mutation. If TS types it as `(comment: Comment) => void`, it matches `onAdded`. If `useStateData`'s `mutations` typing needs the state's mutation generic surfaced, confirm against `packages/rxfy-react` `useStateData` return type and the vite/next usage.

- [ ] **Step 4: verify `examples-shared`** — `pnpm --filter examples-shared check-types` (exit 0), `pnpm --filter examples-shared exec eslint . --fix` then `pnpm --filter examples-shared lint` (exit 0, bare command), `pnpm --filter examples-shared test` (the data smoke test still passes).

- [ ] **Step 5: re-verify vite (Phase 3 must stay green)** — `pnpm turbo check-types lint build --filter=vite-blog-framework` → all pass. vite's `onAddComment` returns `void`, so `onAdded` never fires and behavior is unchanged; this confirms the refinement is backward-compatible.

- [ ] **Step 6: commit**
```bash
git add examples/example-shared/src
git commit -m "feat(examples-shared): optimistic add-comment (addComment mutation + onAdded)"
```
No `Co-Authored-By` trailer.

---

## Task 2: next-blog — dependencies + Tailwind v4 / shadcn / theme

**Files:** `examples/next-blog/package.json`, `next.config.ts`, `postcss.config.mjs` (new), `src/app/globals.css`.

- [ ] **Step 1: dependencies** — READ `examples/next-blog/package.json`, then add these to `devDependencies` (this repo keeps example deps in devDependencies; keep alphabetical). Because `examples-shared` is consumed as SOURCE, next must also declare the shadcn runtime deps it transitively uses so the bundler resolves them:
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
(Match the exact versions used by `examples/vite-blog-framework/package.json` where they overlap — read it and align. `hono` version = vite's hono version.)

- [ ] **Step 2: Next must transpile the source package** — edit `examples/next-blog/next.config.ts`. Add `transpilePackages: ["examples-shared"]` to the config object (this is Next's equivalent of vite's `ssr.noExternal` — it makes Next compile the shared `.tsx` source). Preserve any existing config.

- [ ] **Step 3: PostCSS + Tailwind v4** — create `examples/next-blog/postcss.config.mjs`:
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

- [ ] **Step 4: theme in `globals.css`** — replace the ENTIRE contents of `examples/next-blog/src/app/globals.css` with the shared shadcn theme. The simplest robust approach: copy the full contents of `examples/vite-blog-framework/src/styles.css` (the Tailwind imports + `@custom-variant` + `@theme` + `:root`/`.dark`/`@layer base` blocks) and then fix the ONE `@source` line to point at the shared package from THIS file's location. `globals.css` is at `src/app/globals.css`, so the shared package is three levels up: replace vite's `@source "../../example-shared/src/**/*.{ts,tsx}";` with:
```css
@source "../../../example-shared/src/**/*.{ts,tsx}";
```
Verify: from `examples/next-blog/src/app/globals.css`, `../../../example-shared/src` resolves to `examples/example-shared/src` (confirm with `ls`). Keep the three `@import` lines (`tailwindcss`, `tw-animate-css`, `shadcn/tailwind.css`) and the whole theme verbatim.

- [ ] **Step 5: install + partial verify** — `pnpm install`; then `pnpm --filter rxfy-example-next-blog check-types` (the package `name` is `rxfy-example-next-blog` — use it for `--filter`; verify by reading package.json). It should still pass (nothing consumes the shared package yet). Do not build yet (globals.css theme isn't exercised until components render).

- [ ] **Step 6: commit**
```bash
git add examples/next-blog/package.json examples/next-blog/next.config.ts examples/next-blog/postcss.config.mjs examples/next-blog/src/app/globals.css pnpm-lock.yaml
git commit -m "chore(next-blog): depend on examples-shared + tailwind v4/shadcn theme"
```

---

## Task 3: next-blog — in-memory store + Hono app + catch-all route

**Files (new):** `src/server/store.ts`, `src/server/app.ts`, `src/app/api/[[...route]]/route.ts`.

- [ ] **Step 1: `src/server/store.ts`** — in-memory data seeded from the shared seed, with the read + add-comment operations the routes need:
```ts
import { type Comment, type CommentId, type Post, type PostId, seedComments, seedPosts, seedUsers, type User } from "examples-shared/data";

type Store = { users: User[]; posts: Post[]; comments: Comment[]; nextCommentId: number };

// Persist across hot-reloads / route invocations in one server process.
const globalForStore = globalThis as unknown as { __nextBlogStore?: Store };
const store: Store = (globalForStore.__nextBlogStore ??= {
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
  const comment: Comment = { id: String(store.nextCommentId++) as CommentId, postId, name: input.name, body: input.body };
  store.comments = [...store.comments, comment];
  return comment;
}
```

- [ ] **Step 2: `src/server/app.ts`** — the Hono app (basePath `/api`) + exported `AppType`:
```ts
import { Hono } from "hono";
import { type PostId } from "examples-shared/data";
import { addComment, getPostDetail, listPosts } from "./store.js";

export const app = new Hono()
  .basePath("/api")
  .get("/posts", (c) => c.json(listPosts()))
  .get("/posts/:id", (c) => {
    const detail = getPostDetail(c.req.param("id") as PostId);
    if (!detail) return c.json({ error: "not found" }, 404);
    return c.json(detail);
  })
  .post("/posts/:id/comments", async (c) => {
    const { name, body } = (await c.req.json()) as { name: string; body: string };
    const comment = addComment(c.req.param("id") as PostId, { name, body });
    return c.json(comment);
  });

export type AppType = typeof app;
```
> If typed request bodies via `c.req.json()` casts leave the RPC `$post` call under-typed (as happened in vite Phase 3), use `hono/validator` on the comment route to flow the body type into `AppType` (mirror what vite's `server/api.ts` did). Verify when Task 4's client calls are written.

- [ ] **Step 3: mount at a Next catch-all route** — create `src/app/api/[[...route]]/route.ts`:
```ts
import { handle } from "hono/vercel";
import { app } from "../../../server/app.js";

export const GET = handle(app);
export const POST = handle(app);
```
> `hono/vercel`'s `handle` adapts a Hono app to Next route-handler `(req: Request) => Response`. The app's `basePath("/api")` matches the `/api/...` catch-all. If `hono/vercel` isn't resolvable in this Next/Hono version, fall back to a manual adapter: `export const GET = (req: Request) => app.fetch(req); export const POST = (req: Request) => app.fetch(req);` — verify which works by hitting `/api/posts` in Task 6. Note the `.js` import specifier convention.

- [ ] **Step 4: verify** — `pnpm --filter rxfy-example-next-blog check-types` (exit 0 for these server files; the app/store/route type-check). Commit:
```bash
git add examples/next-blog/src/server examples/next-blog/src/app/api
git commit -m "feat(next-blog): in-memory store + Hono app mounted at /api"
```

---

## Task 4: next-blog — typed RPC client + fetchers

**Files (new):** `src/blog/fetchers.ts`. (Replaces the old data-access role of `src/blog.ts`.)

- [ ] **Step 1: `src/blog/fetchers.ts`** — typed `hc` on the client, direct store read on the server (RSC/SSR), plus the add-comment RPC:
```ts
import { hc } from "hono/client";
import { type Comment, type CommentId, type PostDetailData, type PostId, type PostsData } from "examples-shared";
import type { AppType } from "../server/app.js";

const isServer = typeof window === "undefined";
const client = hc<AppType>("/");

export async function fetchPosts(): Promise<PostsData> {
  if (isServer) {
    const { listPosts } = await import("../server/store.js");
    return listPosts() as unknown as PostsData;
  }
  const res = await client.api.posts.$get();
  return (await res.json()) as unknown as PostsData;
}

export async function fetchPostDetail({ postId }: { postId: PostId }): Promise<PostDetailData> {
  if (isServer) {
    const { getPostDetail } = await import("../server/store.js");
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
> `import type { AppType }` is erased (`verbatimModuleSyntax`), so the Hono app / store never reach the client bundle; the server branch dynamic-imports the store. The exact `hc` accessor shape (`client.api.posts.$get`, `client.api.posts[":id"].$get`, `.comments.$post`) follows from the app's `basePath("/api")` + chain — after writing, run check-types and correct any accessor mismatch, reporting it. `addCommentRpc` returns a fully-branded `Comment` for the optimistic `onAdded`.

- [ ] **Step 2: verify** — `pnpm --filter rxfy-example-next-blog check-types` (exit 0; the RPC calls resolve against `AppType`, fetchers return the shared shapes). If the cross-file `import type { AppType }` from `src/server/app.ts` into `src/blog/fetchers.ts` doesn't resolve, check `tsconfig.json` `include` covers both `src/server` and `src/blog` (a single Next `tsconfig` normally includes all of `src`, so no change is expected — unlike vite's split projects). Report if anything was needed.

- [ ] **Step 3: commit**
```bash
git add examples/next-blog/src/blog
git commit -m "feat(next-blog): typed hc RPC client + fetchers"
```

---

## Task 5: next-blog — render shared components (providers, view wrappers, pages) + delete locals

**Files:** rewrite `src/providers.tsx`; new `src/components/HomeView.tsx`, `src/components/PostView.tsx`; rewrite `src/app/page.tsx`, `src/app/posts/[id]/page.tsx`; delete `src/blog.ts`, `src/db.ts`, `src/components/PostList.tsx`, `src/components/PostDetail.tsx`, `src/components/AddCommentForm.tsx`.

- [ ] **Step 1: rewrite `src/providers.tsx`** — wrap the app in `BlogProvider` (navigate via `next/navigation`, onAddComment via RPC) alongside the existing rxfy provider + streaming hydration:
```tsx
"use client";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { BlogProvider } from "examples-shared";
import { StoreProvider } from "rxfy-react";
import { HydrationStream } from "rxfy-react/next";
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
      <HydrationStream />
      <BlogProvider value={blog}>{children}</BlogProvider>
    </StoreProvider>
  );
}
```

- [ ] **Step 2: `src/components/HomeView.tsx`** (client wrapper — binds the fetcher so no function crosses the RSC boundary):
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

- [ ] **Step 4: rewrite `src/app/page.tsx`** (server component renders the client wrapper):
```tsx
import { HomeView } from "../components/HomeView";

export default function HomePage() {
  return <HomeView />;
}
```

- [ ] **Step 5: rewrite `src/app/posts/[id]/page.tsx`** (server component; `id` is a serializable string prop — OK to pass):
```tsx
import { type PostId } from "examples-shared/data";
import { PostView } from "../../../components/PostView";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostView postId={id as PostId} />;
}
```

- [ ] **Step 6: delete the now-shared locals**
```bash
git rm examples/next-blog/src/blog.ts examples/next-blog/src/db.ts \
       examples/next-blog/src/components/PostList.tsx \
       examples/next-blog/src/components/PostDetail.tsx \
       examples/next-blog/src/components/AddCommentForm.tsx
```
> `src/app/layout.tsx` imports `RxfyProvider` from `../providers` and `./globals.css` — both still valid, no change. `src/app/not-found.tsx` — READ it; if it references deleted modules, minimally fix (it likely doesn't).

- [ ] **Step 7: verify** — `pnpm --filter rxfy-example-next-blog check-types` → exit 0. `pnpm --filter rxfy-example-next-blog exec eslint . --fix` then `pnpm --filter rxfy-example-next-blog lint` → exit 0 (bare command). Confirm no dangling refs: `grep -rn "from \"../blog\"\|from \"../../blog\"\|from \"../../../blog\"\|/db\"\|components/PostList\|components/PostDetail\|components/AddCommentForm" examples/next-blog/src` → should be empty (only the new `blog/fetchers` imports remain, which are `./blog/fetchers` / `../blog/fetchers`).

- [ ] **Step 8: commit**
```bash
git add examples/next-blog/src
git commit -m "feat(next-blog): render shared components via BlogProvider + view wrappers"
```

---

## Task 6: next-blog — build + runtime SSR smoke

- [ ] **Step 1: type-check + lint + build gate**
  - `pnpm --filter rxfy-example-next-blog check-types` → exit 0.
  - `pnpm --filter rxfy-example-next-blog lint` → exit 0 (bare).
  - `pnpm --filter rxfy-example-next-blog build` → the Next production build must succeed. This is the key integration gate — it exercises `transpilePackages: ["examples-shared"]` (compiling the shared `.tsx` source, incl. `"use client"` boundaries) and Tailwind v4 via PostCSS scanning the shared package. If it fails on resolving the shadcn runtime deps (`radix-ui`, etc.) from the shared source, confirm Task 2 Step 1 added them to next-blog's deps; if it fails transpiling `examples-shared`, confirm `transpilePackages`. Capture the exact error if any.

- [ ] **Step 2: runtime SSR smoke** — start the dev server in the background and probe (Next dev default port 3000; if taken, read the port from the log):
```bash
cd /Users/vanya2h/Repos/rxfy/examples/next-blog
pnpm dev > /tmp/next-blog-dev.log 2>&1 &
sleep 10
PORT=$(grep -oE 'http://localhost:[0-9]+' /tmp/next-blog-dev.log | head -1 | grep -oE '[0-9]+$'); echo "port=$PORT"
echo "=== /api/posts ==="; curl -s "http://localhost:$PORT/api/posts" | head -c 500
echo; echo "=== home SSR: seeded title present? ==="; curl -s "http://localhost:$PORT/" | grep -oc 'Getting Started with rxfy'
echo "=== detail SSR: post 1 ==="; curl -s "http://localhost:$PORT/posts/1" | grep -oc 'Getting Started with rxfy'
echo "=== dev log tail ==="; tail -30 /tmp/next-blog-dev.log
```
Assert:
- `/api/posts` returns JSON with `posts`, `authors`, and `meta.total` (the Hono RPC route works in-process).
- The home page SSR HTML contains the seeded title `Getting Started with rxfy` at least once (shared `PostList`/`PostItem` render server-side through the shared store — the point of the migration).
- `/posts/1` SSR contains the post title (shared `PostDetail` renders).
- The dev log is free of unresolved-module / `"use client"` / transpile / hydration errors.
Then stop the dev server: `pkill -f "next dev" || pkill -f next-blog || true`; confirm stopped.
If the seeded title is absent from SSR HTML, inspect the dev log and report (common causes: `transpilePackages` missing → shared source not compiled; or Tailwind not scanning → unstyled but title should still be present, so absence of the TITLE points to a render/transpile error, not styling).

- [ ] **Step 3: monorepo gate** — `pnpm turbo check-types lint build --filter=rxfy-example-next-blog` → all pass. Also `pnpm turbo check-types --filter=examples-shared` and `pnpm turbo check-types build --filter=vite-blog-framework` to confirm the Task 1 shared change didn't regress the shared package or vite.

- [ ] **Step 4: commit** (empty phase-closer if the entries needed no further edits)
```bash
git commit --allow-empty -m "chore(next-blog): finalize shared-package migration + verify build/SSR"
```

---

## Self-Review Notes

- **Spec coverage:** next-blog now consumes `examples-shared` (shadcn UI + shared Zod models/states + read components), fetches via its OWN in-memory-backed Hono RPC client (`hc<AppType>` mounted at a Next catch-all route), and injects behavior via `BlogProvider` (navigate through `next/navigation`, onAddComment through RPC). Content is the shared seed. Read + add-comment only (no live, no create/edit/delete) — matches the non-live example scope.
- **Shared refinement is minimal + backward-compatible:** `addComment` mutation + optional `AddCommentForm.onAdded` + widened `onAddComment` return. vite (Phase 3) re-verified green in Task 1 Step 5 because vite's `onAddComment` returns `void`.
- **RSC integration correctness:** (1) `transpilePackages: ["examples-shared"]` compiles the shared `.tsx` source under Next; (2) the shadcn runtime deps are declared on next-blog so the bundler resolves them from the source package; (3) fetcher functions never cross the server→client boundary — `HomeView`/`PostView` `"use client"` wrappers bind them; (4) `import type { AppType }` is erased so no server code enters the client bundle; (5) RSC/SSR reads the store directly, client uses `hc`.
- **Known-risk areas flagged with fallbacks:** `hono/vercel` `handle` vs a manual `app.fetch` adapter (Task 3 Step 3); typed RPC body via `hono/validator` if needed (Task 3 Step 2); `hc` accessor shape correction (Task 4 Step 1); Next build transpile/resolution (Task 6 Step 1). Each has a verification.
- **Out of scope (Phases 4b/4c):** rr7-blog (React Router 7 — Hono via a resource/splat route + `entry.server` hydration) and waku-blog (Waku RSC — Hono mount + `prefetch`/`HydrateSnapshot` handoff), replicating this reference with the same shared package + view-wrapper pattern.
