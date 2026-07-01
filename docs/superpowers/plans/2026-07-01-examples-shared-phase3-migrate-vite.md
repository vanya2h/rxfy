# examples-shared Phase 3 — Migrate vite-blog-framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `examples/vite-blog-framework` onto the shared `examples-shared` package — consuming its shadcn UI, shared Zod models/states, and read components — while keeping vite's additive create/edit/delete UI and its live/SSR/websocket wiring intact. This is the validation phase: it proves the shared package composes in a real app before we replicate to next/rr7/waku.

**Architecture:** vite's Drizzle tables are bound to the SHARED rxfy models via `defineResource({ table, model })` (Phase 1) — the shared model (keyed by name "post"/"user"/"comment") drives the client store + live routing; the table only drives SQL. Field names in the DB are renamed to match the shared model (`userId`, comment `name`). vite renders the shared `PostList`/`PostDetail`/etc., injecting per-example behavior via `BlogProvider` (navigate + onAddComment) and fetchers as props, and its create/edit/delete extras via the components' render-slot props (`header`/`renderItemActions`/`renderCommentActions`). The client fetches via a typed Hono RPC client (`hc<AppType>`); SSR keeps vite's proven direct-DB read path (grants are minted server-side in `entry-server`, unchanged).

**Tech Stack:** Vite SSR, Hono + Hono RPC (`hc`), `@hono/node-ws`, PGlite + Drizzle, rxfy / rxfy-react / rxfy-server / rxfy-ws, Tailwind v4 + shadcn (via `examples-shared`).

Spec: `docs/superpowers/specs/2026-07-01-examples-shared-design.md`. Phase 3 of 4. Depends on Phase 1 (`defineResource({ model })`, merged) and Phase 2 (`examples-shared`, merged). Reference map of vite's current code is in the conversation.

## Key decisions (documented)
- **Client uses typed `hc<AppType>` RPC; SSR keeps the direct-DB read branch.** vite already reads the DB in-process during SSR via a dynamic `import("../../server/db.js")` guarded by `isServer`; that path is proven and grants are minted separately in `entry-server`. We upgrade only the CLIENT fetch from raw `fetch()` to typed `hc`. (next/rr7/waku will use `hc` on both sides over in-memory data in Phase 4.)
- **DB field renames to match the shared model:** `posts.author_id` → `posts.user_id` (JS `userId`), `comments.author` → `comments.name`. `created_at` stays on both tables — the shared Zod model omits it, and `defineResource` is generic over the injected model's row (Phase 1), so extra columns are fine; the model's schema strips `createdAt` when normalizing into the store.
- **Inline post-edit stays, via a stateful actions wrapper** rendered into the shared `PostItem`'s `actions` (footer) slot — no dialog, no change to the shared component.
- **The shadcn theme stays in vite's local `src/styles.css`** (it works with Tailwind's auto content-detection); we only add an `@source` line so Tailwind also scans `examples-shared/src`. The shared `styles.css` serves the RSC examples in Phase 4.

---

## File Structure

**vite files DELETED** (now provided by `examples-shared`):
```
src/components/PostList.tsx  PostDetail.tsx  PostItem.tsx  CommentItem.tsx  AddCommentForm.tsx  UpdatesBadge.tsx
src/components/ui/           (whole dir)
src/lib/utils.ts             (and src/lib if empty)
src/blog/states.ts           (use examples-shared/data)
src/blog/types.ts            (use examples-shared/data)
```
**vite files EDITED:**
```
package.json                 add examples-shared dep
vite.config.ts               ssr.noExternal + optimizeDeps for the source package
src/styles.css               @source the shared package
src/db/schema.ts             userId / name column renames
server/db.ts                 DDL + seed renames
src/blog/resources.ts        defineResource({ table, model: sharedModel })
server/api.ts                chained routes + export AppType + meta + field renames
src/blog/api-client.ts       hc client branch + renames (SSR branch kept)
src/routes.ts                import states from examples-shared/data
src/App.tsx                  render shared components + BlogProvider + slots
src/entry-server.tsx         import path updates
src/components/NewPostForm.tsx  ui from examples-shared/ui + userId
src/components/EditPostForm.tsx ui from examples-shared/ui
src/components/ThemeToggle.tsx  Button from examples-shared/ui
```
**vite files CREATED:**
```
src/components/PostActions.tsx    edit/delete for a post (renderItemActions slot)
src/components/CommentActions.tsx delete for a comment (renderCommentActions slot)
```

---

## Task 1: Wire the `examples-shared` dependency + Vite/Tailwind config

**Files:** `examples/vite-blog-framework/package.json`, `vite.config.ts`, `src/styles.css`.

- [ ] **Step 1: add the dep** — in `examples/vite-blog-framework/package.json`, add to `devDependencies` (vite deps live in devDependencies here): `"examples-shared": "workspace:*"`. Keep alphabetical order among the workspace deps (next to `rxfy`/`rxfy-react`).

- [ ] **Step 2: Vite must process the source package** — READ the current `vite.config.ts`. It has `resolve.alias` for `@`. Add (merge, don't clobber existing keys) an `ssr.noExternal` and `optimizeDeps.exclude` so Vite transforms `examples-shared`'s `.tsx` source (it exports source, not a built bundle) on both the SSR and client sides:
```ts
  ssr: {
    noExternal: ["examples-shared"],
  },
  optimizeDeps: {
    exclude: ["examples-shared"],
  },
```
If `vite.config.ts` already has an `ssr` or `optimizeDeps` block, merge these keys into it. Leave the `@tailwindcss/vite` and react plugins and the `@` alias as-is.

- [ ] **Step 3: Tailwind scans the shared package** — in `examples/vite-blog-framework/src/styles.css`, add one `@source` line immediately after the three `@import` lines at the top (before `@custom-variant`):
```css
@source "../../example-shared/src/**/*.{ts,tsx}";
```
(From `src/styles.css`, `../../example-shared/src` resolves to `examples/example-shared/src` — the shared package's real source dir, so the utility classes used by shared components get generated.) Do NOT otherwise change the theme.

- [ ] **Step 4: install + verify boot** — from repo root:
  - `pnpm install`
  - `pnpm --filter vite-blog-framework check-types` — must still exit 0 (nothing consumes the shared package yet).
  - `pnpm --filter vite-blog-framework exec vite build --outDir dist/client 2>&1 | tail -20` — the client build must succeed (proves Vite resolves the workspace dep and config is valid). If it fails on the shared package resolution, adjust `optimizeDeps`/`ssr.noExternal` and re-run.

- [ ] **Step 5: commit**
```bash
git add examples/vite-blog-framework/package.json examples/vite-blog-framework/vite.config.ts examples/vite-blog-framework/src/styles.css pnpm-lock.yaml
git commit -m "chore(vite-blog): depend on examples-shared + tailwind @source"
```
No `Co-Authored-By` trailer.

---

## Task 2: Rename DB fields to the shared model's convention

**Files:** `src/db/schema.ts`, `server/db.ts`.

- [ ] **Step 1: `src/db/schema.ts`** — rename columns so Drizzle's inferred rows match the shared Zod models (`Post.userId`, `Comment.name`):
```ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  name: text("name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: `server/db.ts`** — update the DDL and seed to the new column names. In the `DDL` template string: `posts` column `author_id text NOT NULL` → `user_id text NOT NULL`; `comments` column `author text NOT NULL` → `name text NOT NULL`. In the seed `db.insert(posts).values([...])`: each object's `authorId:` → `userId:` (keep the `u1/u2/u3` values). In `db.insert(comments).values([...])`: each object's `author:` → `name:` (keep the values, e.g. `name: "Bob Smith"`). Leave the users seed unchanged.

- [ ] **Step 3: verify** — `pnpm --filter vite-blog-framework check-types` must exit 0. (Downstream code still references the old names in a few places; if check-types now flags them, that's expected — those files are fixed in Tasks 3–5. To keep this task green in isolation, run check-types and if the ONLY errors are `authorId`/`author` references in `server/api.ts`, `src/blog/api-client.ts`, or components, proceed — they're addressed next. If you prefer a clean gate, do a quick `grep -rn "authorId\|\.author\b" src server` and note the call sites for Tasks 3–5.) The schema/db files themselves must type-check.

- [ ] **Step 4: commit**
```bash
git add examples/vite-blog-framework/src/db/schema.ts examples/vite-blog-framework/server/db.ts
git commit -m "refactor(vite-blog): rename DB fields to shared model convention (userId, name)"
```

> Note: check-types may not be fully green until Task 5. That's acceptable mid-refactor; each later task drives it back toward green and Task 6 is the hard gate.

---

## Task 3: Bind resources to shared models + adopt shared states

**Files:** `src/blog/resources.ts`, delete `src/blog/states.ts` + `src/blog/types.ts`, `src/routes.ts`, `server/api.ts`.

- [ ] **Step 1: `src/blog/resources.ts`** — inject the shared models so the store + live routing use the shared `ModelDescriptor`s:
```ts
import { commentModel, postModel, userModel } from "examples-shared/data";
import { createResourceRegistry, defineResource } from "rxfy-server/browser";
import { comments, posts, users } from "../db/schema.js";

export const userResource = defineResource({ table: users, model: userModel });
export const postResource = defineResource({ table: posts, model: postModel });
export const commentResource = defineResource({ table: comments, model: commentModel });

export { commentModel, postModel, userModel };

export const resources = createResourceRegistry([userResource, postResource, commentResource]);
```
> Re-exporting the models keeps existing `import { postModel } from "./resources.js"` call sites working (e.g. the deleted local components imported them; the new `PostActions` will import from `examples-shared/data` directly, but re-exporting is harmless and convenient).

- [ ] **Step 2: delete `src/blog/states.ts`** — the shared `postsState`/`postDetailState` replace it. `rm examples/vite-blog-framework/src/blog/states.ts`.

- [ ] **Step 3: delete `src/blog/types.ts`** — shared `Post`/`User`/`Comment` types replace it. `rm examples/vite-blog-framework/src/blog/types.ts`.

- [ ] **Step 4: `src/routes.ts`** — change the states import to the shared package:
```ts
import { postDetailState, postsState } from "examples-shared/data";
```
(only that import line changes; the rest of `routes.ts` is unchanged — `postsState`/`postDetailState` still expose `.fields` and cast to `StateChannelDescriptor` identically.)

- [ ] **Step 5: `server/api.ts` — states import + `meta` + field renames** (this file is further rewritten in Task 4; here just make it consistent with shared states/fields):
  - Change `import { postDetailState, postsState } from "../src/blog/states.js";` → `import { postDetailState, postsState } from "examples-shared/data";`
  - In `GET /posts`, the shared `postsState` has a `meta` field, so the normalized `data` must include it. Build:
    ```ts
    const data = {
      posts: allPosts,
      authors: allUsers,
      meta: { total: allPosts.length, generatedAt: new Date().toISOString() },
    };
    ```
  - The `create`/`comment` handlers send fields to `live.create`; rename `authorId` → `userId` (post create) and `author` → `name` (comment create) to match the renamed columns/model. (Full handler bodies are rewritten in Task 4 — if you are doing Tasks 3 and 4 back-to-back, you may fold these renames into Task 4's rewrite and skip re-editing here; just ensure Task 3 leaves the file compiling against shared states.)

- [ ] **Step 6: verify** — `pnpm --filter vite-blog-framework check-types`. Errors remaining should only be in `src/blog/api-client.ts` and the to-be-deleted components (Task 5) and `server/api.ts` mutation bodies (Task 4). The resources/routes/states wiring itself must type-check — in particular confirm `defineResource({ table: posts, model: postModel })` type-checks (Phase 1 made the row follow the injected model, so the table's extra `createdAt` column is fine).

- [ ] **Step 7: commit**
```bash
git add examples/vite-blog-framework/src/blog/resources.ts examples/vite-blog-framework/src/routes.ts examples/vite-blog-framework/server/api.ts
git rm examples/vite-blog-framework/src/blog/states.ts examples/vite-blog-framework/src/blog/types.ts
git commit -m "refactor(vite-blog): bind resources to shared models + adopt shared states"
```

---

## Task 4: Chained Hono routes + `AppType` + typed `hc` RPC client

**Files:** `server/api.ts`, `src/blog/api-client.ts`, and possibly `tsconfig.app.json`/`tsconfig.node.json` (to let the client type-import `AppType`).

- [ ] **Step 1: refactor `server/api.ts` into a single fluent chain and export `AppType`** — Hono RPC requires the routes chained off one `new Hono()` so the type is inferred. Rewrite the route definitions as one chain (keeping all current behavior + the Task 3 `meta` and field renames):
```ts
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createModelRegistry, normalizeResult } from "rxfy";
import { type StateChannelDescriptor, touch } from "rxfy-server";
import { postDetailState, postsState } from "examples-shared/data";
import { commentResource, postResource, userResource } from "../src/blog/resources.js";
import { comments, db, posts, users } from "./db.js";
import { live } from "./live.js";

const postsChannel = postsState as unknown as StateChannelDescriptor;
const postDetailChannel = postDetailState as unknown as StateChannelDescriptor;
const newId = () => crypto.randomUUID();

export const api = new Hono()
  .get("/posts", async (c) => {
    const allPosts = await db.select().from(posts);
    const allUsers = await db.select().from(users);
    const data = {
      posts: allPosts,
      authors: allUsers,
      meta: { total: allPosts.length, generatedAt: new Date().toISOString() },
    };
    const registry = createModelRegistry();
    normalizeResult(registry, postsState.fields, data);
    const grants = live.grant(registry, {
      entities: [postResource, userResource],
      states: [{ state: postsChannel, params: {} }],
    });
    return c.json({ data, grants });
  })
  .get("/posts/:id", async (c) => {
    const postId = c.req.param("id");
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) return c.json({ error: "not found" }, 404);
    const [author] = await db.select().from(users).where(eq(users.id, post.userId));
    const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
    const data = { post, author, comments: postComments };
    const registry = createModelRegistry();
    normalizeResult(registry, postDetailState.fields, data);
    const grants = live.grant(registry, {
      entities: [postResource, userResource, commentResource],
      states: [{ state: postDetailChannel, params: { postId } }],
    });
    return c.json({ data, grants });
  })
  .post("/posts", async (c) => {
    const { userId, title, body } = (await c.req.json()) as { userId: string; title: string; body: string };
    const row = await live.create(postResource, { id: newId(), userId, title, body }, { touch: [touch(postsChannel, {})] });
    return c.json(row);
  })
  .patch("/posts/:id", async (c) => {
    const patch = (await c.req.json()) as Partial<{ title: string; body: string }>;
    const row = await live.update(postResource, c.req.param("id"), patch);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .delete("/posts/:id", async (c) => {
    await live.delete(postResource, c.req.param("id"), { touch: [touch(postsChannel, {})] });
    return c.json({ ok: true });
  })
  .post("/posts/:id/comments", async (c) => {
    const postId = c.req.param("id");
    const { name, body } = (await c.req.json()) as { name: string; body: string };
    const row = await live.create(
      commentResource,
      { id: newId(), postId, name, body },
      { touch: [touch(postDetailChannel, { postId })] },
    );
    return c.json(row);
  })
  .patch("/comments/:id", async (c) => {
    const patch = (await c.req.json()) as Partial<{ body: string }>;
    const row = await live.update(commentResource, c.req.param("id"), patch);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json(row);
  })
  .delete("/posts/:postId/comments/:id", async (c) => {
    const postId = c.req.param("postId");
    await live.delete(commentResource, c.req.param("id"), { touch: [touch(postDetailChannel, { postId })] });
    return c.json({ ok: true });
  });

export type AppType = typeof api;
```
> `app.route("/api", api)` in `server/index.ts` is unchanged — the mount stays `/api`, so the RPC client bases at `/api` and calls `client.posts.$get()` etc.

- [ ] **Step 2: rewrite `src/blog/api-client.ts`** — typed `hc` on the client, direct-DB on the server, with the shared return types and renamed fields:
```ts
import { hc } from "hono/client";
import type { PostDetailData, PostId, PostsData } from "examples-shared";
import { getLiveClient } from "../live-singleton.js";
import type { AppType } from "../../server/api.js";

const isServer = typeof window === "undefined";
const client = hc<AppType>("/api");

type Grants = { entities: Record<string, string>; channels: Record<string, string> };

export async function fetchPosts(): Promise<PostsData> {
  if (isServer) {
    const { db, posts, users } = await import("../../server/db.js");
    const rows = await db.select().from(posts);
    const authors = await db.select().from(users);
    return { posts: rows, authors, meta: { total: rows.length, generatedAt: new Date().toISOString() } } as unknown as PostsData;
  }
  const res = await client.posts.$get();
  const body = (await res.json()) as { data: PostsData; grants: Grants };
  getLiveClient()?.addGrants(body.grants);
  return body.data;
}

export async function fetchPostDetail({ postId }: { postId: PostId }): Promise<PostDetailData> {
  if (isServer) {
    const { db, posts, users, comments } = await import("../../server/db.js");
    const { eq } = await import("drizzle-orm");
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new Error(`Post ${postId} not found`);
    const [author] = await db.select().from(users).where(eq(users.id, post.userId));
    const postComments = await db.select().from(comments).where(eq(comments.postId, postId));
    return { post, author, comments: postComments } as unknown as PostDetailData;
  }
  const res = await client.posts[":id"].$get({ param: { id: postId } });
  if (!res.ok) throw new Error(`Post ${postId} not found`);
  const body = (await res.json()) as { data: PostDetailData; grants: Grants };
  getLiveClient()?.addGrants(body.grants);
  return body.data;
}

export const createPost = (p: { userId: string; title: string; body: string }) => client.posts.$post({ json: p });
export const editPost = (id: string, p: { title?: string; body?: string }) =>
  client.posts[":id"].$patch({ param: { id }, json: p });
export const deletePost = (id: string) => client.posts[":id"].$delete({ param: { id } });
export const addComment = (postId: string, p: { name: string; body: string }) =>
  client.posts[":id"].comments.$post({ param: { id: postId }, json: p });
export const deleteComment = (postId: string, id: string) =>
  client.posts[":postId"].comments[":id"].$delete({ param: { postId, id } });
```
> The `import type { AppType }` is erased under `verbatimModuleSyntax`, so the Hono app (and its `node:crypto`/pglite deps) never enters the client bundle. `editComment` from the old client is dropped (unused by the UI); if a call site references it, re-add `export const editComment = (id, p) => client.comments[":id"].$patch({ param: { id }, json: p });`.

- [ ] **Step 3: make `AppType` type-importable across the tsconfig projects** — `src/blog/api-client.ts` (app project) type-imports from `server/api.ts` (node project). READ `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`. Run `pnpm --filter vite-blog-framework check-types`. If it errors that `../../server/api.js` (or `AppType`) can't be found/resolved from the app project:
  - Preferred fix: ensure the app project can see the server file. If `tsconfig.node.json` already `include`s `server/**` and is `composite`, add a reference from `tsconfig.app.json`: `"references": [{ "path": "./tsconfig.node.json" }]` — BUT first check this doesn't create a cycle (the node project imports `../src/blog/*`; if `tsconfig.node.json` references `tsconfig.app.json`, you cannot also reference back). If a cycle exists, instead broaden the app project's `include` to also cover `server` for type resolution, OR set `tsconfig.app.json` `compilerOptions` so the type import resolves (e.g. it already emits with `moduleResolution: bundler` — a plain `import type` from a sibling path may resolve without a project reference if both are in the same `tsc -b` graph).
  - Whatever the mechanism, the REQUIRED outcome: `check-types` resolves `AppType` and the RPC calls are typed. If after reasonable effort project-refs fight this, the acceptable fallback is to widen the root `tsconfig.json`/`tsconfig.app.json` `include` to encompass both `src` and `server` in one program. Report exactly what you changed.

- [ ] **Step 4: verify** — `pnpm --filter vite-blog-framework check-types` (server routes + client RPC types resolve; remaining errors, if any, are only in the components deleted/rewritten in Task 5). Confirm the chained `api` still type-checks and `AppType` is exported.

- [ ] **Step 5: commit**
```bash
git add examples/vite-blog-framework/server/api.ts examples/vite-blog-framework/src/blog/api-client.ts examples/vite-blog-framework/tsconfig*.json
git commit -m "feat(vite-blog): typed hc RPC client + chained AppType routes"
```

---

## Task 5: Render shared components + BlogProvider + additive slots; delete duplicated UI

**Files:** create `src/components/PostActions.tsx`, `src/components/CommentActions.tsx`; edit `src/App.tsx`, `src/components/NewPostForm.tsx`, `src/components/EditPostForm.tsx`, `src/components/ThemeToggle.tsx`; delete the six duplicated components + `src/components/ui/` + `src/lib/utils.ts`.

- [ ] **Step 1: delete the now-shared components + ui + lib**
```bash
git rm examples/vite-blog-framework/src/components/PostList.tsx \
       examples/vite-blog-framework/src/components/PostDetail.tsx \
       examples/vite-blog-framework/src/components/PostItem.tsx \
       examples/vite-blog-framework/src/components/CommentItem.tsx \
       examples/vite-blog-framework/src/components/AddCommentForm.tsx \
       examples/vite-blog-framework/src/components/UpdatesBadge.tsx \
       examples/vite-blog-framework/src/lib/utils.ts
git rm -r examples/vite-blog-framework/src/components/ui
```

- [ ] **Step 2: `src/components/PostActions.tsx`** (NEW) — the edit/delete controls for one post, rendered into the shared `PostItem`'s `actions` (footer) slot. It manages its own edit toggle and renders `EditPostForm` inline when editing:
```tsx
import { useMemo, useState } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { postModel, type PostId } from "examples-shared/data";
import { Button } from "examples-shared/ui/button";
import { deletePost } from "../blog/api-client.js";
import { EditPostForm } from "./EditPostForm.js";

export function PostActions({ id }: { id: PostId }) {
  const store = useModelStore(postModel);
  const post$ = useMemo(() => store.get(id), [store, id]);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <Pending value$={post$} pending={null}>
        {(post) => (
          <EditPostForm id={post.id} title={post.title} body={post.body} onDone={() => setEditing(false)} />
        )}
      </Pending>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void deletePost(id)}>
        Delete
      </Button>
    </>
  );
}
```

- [ ] **Step 3: `src/components/CommentActions.tsx`** (NEW) — the delete control for one comment, rendered into the shared `CommentItem`'s `actions` slot:
```tsx
import { Trash2 } from "lucide-react";
import { type CommentId } from "examples-shared/data";
import { Button } from "examples-shared/ui/button";
import { deleteComment } from "../blog/api-client.js";

export function CommentActions({ postId, id }: { postId: string; id: CommentId }) {
  return (
    <Button variant="ghost" size="icon" onClick={() => void deleteComment(postId, id)} aria-label="Delete comment">
      <Trash2 />
    </Button>
  );
}
```

- [ ] **Step 4: `src/components/NewPostForm.tsx`** — update the ui imports to `examples-shared/ui/*` and send `userId` (was `authorId`). Change the import block to:
```tsx
import { useState } from "react";
import { Button } from "examples-shared/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "examples-shared/ui/card";
import { Input } from "examples-shared/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "examples-shared/ui/select";
import { Textarea } from "examples-shared/ui/textarea";
import { createPost } from "../blog/api-client.js";
```
Keep the `AUTHORS = [{ id: "u1", name: "Alice Doe" }, ...]` list (vite's PGlite seed still uses `u1/u2/u3`). Rename the state var `authorId`→`userId` (and `setAuthorId`→`setUserId`) and the submit call to `createPost({ userId, title: title.trim(), body: body.trim() })`. The `<Select value={userId} onValueChange={setUserId}>` maps the selected author id to `userId`.

- [ ] **Step 5: `src/components/EditPostForm.tsx`** — only change the ui imports to:
```tsx
import { Button } from "examples-shared/ui/button";
import { Input } from "examples-shared/ui/input";
import { Textarea } from "examples-shared/ui/textarea";
```
(the `import { useState } from "react"` and the `editPost` import from `../blog/api-client.js` stay; the component body is unchanged.)

- [ ] **Step 6: `src/components/ThemeToggle.tsx`** — change `import { Button } from "@/components/ui/button";` → `import { Button } from "examples-shared/ui/button";`. Nothing else changes (the CSS-variant Sun/Moon toggle stays).

- [ ] **Step 7: `src/App.tsx`** — render the shared components, wrap in `BlogProvider`, inject fetchers + slots:
```tsx
import { useEffect, useState } from "react";
import { BlogProvider, PostDetail, PostList } from "examples-shared";
import { addComment, fetchPostDetail, fetchPosts } from "./blog/api-client.js";
import { CommentActions } from "./components/CommentActions.js";
import { NewPostForm } from "./components/NewPostForm.js";
import { PostActions } from "./components/PostActions.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { bindNavigation, navigate } from "./navigation.js";
import { matchRoute } from "./routes.js";

const blog = {
  navigate,
  onAddComment: (postId: string, input: { name: string; body: string }) => addComment(postId, input),
};

export function App({ url }: { url: string }) {
  const [path, setPath] = useState(() => new URL(url, "http://localhost").pathname);

  useEffect(() => {
    const unbind = bindNavigation(setPath);
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      unbind();
    };
  }, []);

  const route = matchRoute(path);
  return (
    <BlogProvider value={blog}>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="text-xl font-semibold">
            rxfy live blog
          </a>
          <ThemeToggle />
        </header>
        {route.name === "home" && (
          <PostList
            fetchPosts={fetchPosts}
            header={<NewPostForm />}
            renderItemActions={(id) => <PostActions id={id} />}
          />
        )}
        {route.name === "post" && (
          <PostDetail
            postId={route.postId}
            fetchPostDetail={fetchPostDetail}
            renderCommentActions={(id) => <CommentActions postId={route.postId} id={id} />}
          />
        )}
        {route.name === "not-found" && <p className="text-muted-foreground">Not found.</p>}
      </main>
    </BlogProvider>
  );
}
```
> Types: `route.postId` is a plain `string` (from `matchRoute`); `PostDetail`'s `postId` prop is `PostId` (branded). If check-types flags this, cast at the boundary: `postId={route.postId as PostId}` (import `type { PostId } from "examples-shared/data"`). Likewise `id` inside `renderCommentActions`/`renderItemActions` is already the branded `CommentId`/`PostId` from the shared component — matches `CommentActions`/`PostActions` props. Resolve any brand mismatch with a minimal cast and report it.

- [ ] **Step 8: verify** — `pnpm --filter vite-blog-framework check-types` must now be **exit 0** (all references resolved). Then `pnpm --filter vite-blog-framework lint`: run `pnpm --filter vite-blog-framework exec eslint . --fix` first (import ordering), then the bare `pnpm --filter vite-blog-framework lint` and confirm **exit 0** — do NOT pipe lint through `tail`. Confirm no dangling imports of the deleted files: `grep -rn "components/PostList\|components/PostDetail\|components/PostItem\|components/CommentItem\|components/AddCommentForm\|components/UpdatesBadge\|components/ui/\|lib/utils\|blog/states\|blog/types" examples/vite-blog-framework/src examples/vite-blog-framework/server` → should be empty.

- [ ] **Step 9: commit**
```bash
git add examples/vite-blog-framework/src
git commit -m "feat(vite-blog): render shared components via BlogProvider + slots"
```

---

## Task 6: Entry wiring + full verification (build, dev SSR smoke, runtime)

**Files:** `src/entry-server.tsx`, `src/entry-client.tsx` (import paths only), then full gates.

- [ ] **Step 1: `src/entry-server.tsx`** — it imports `commentResource, postResource, userResource` from `./blog/resources.js` (still valid) and `matchRoute, routeStates` from `./routes.js` (still valid). No state/type import comes from the deleted files. READ it and, if it imports anything from `./blog/states.js` or `./blog/types.js`, repoint to `examples-shared/data`. Otherwise leave it unchanged. The `live.grant(...)` SSR grant block stays exactly as-is (grants are still minted server-side).

- [ ] **Step 2: `src/entry-client.tsx`** — READ it. It imports `./styles.css` (kept, now with the `@source` line) and sets up `createLiveClient` + `createWsClient` + `setLiveClient`. No changes expected unless it imports a deleted module. Leave the live-client/websocket wiring untouched.

- [ ] **Step 3: type-check + lint gate**
  - `pnpm --filter vite-blog-framework check-types` → exit 0.
  - `pnpm --filter vite-blog-framework lint` → exit 0 (bare command, verify exit code).

- [ ] **Step 4: build gate** — both Vite builds must succeed:
  - `pnpm --filter vite-blog-framework exec vite build --outDir dist/client` → success.
  - `pnpm --filter vite-blog-framework exec vite build --ssr src/entry-server.tsx --outDir dist/server` → success.
  (Or `pnpm --filter vite-blog-framework build` which runs both.) A failure here most likely means Vite couldn't process `examples-shared` source — revisit Task 1's `ssr.noExternal`/`optimizeDeps`.

- [ ] **Step 5: dev SSR + runtime smoke** — start the dev server in the background and probe it:
  ```bash
  (cd examples/vite-blog-framework && pnpm dev > /tmp/vite-blog-dev.log 2>&1 &) ; sleep 6
  curl -s http://localhost:5176/api/posts | head -c 400        # expect JSON with data.posts, data.meta.total, and grants
  curl -s http://localhost:5176/ | grep -o 'rxfy live blog'    # expect the SSR'd header text present
  curl -s http://localhost:5176/ | grep -oc 'Getting Started with rxfy'  # expect >=1 (a seeded post title rendered server-side)
  ```
  Confirm: `/api/posts` returns `data.meta` (proves the shared state's meta field is wired) and the seeded post title appears in server-rendered HTML (proves shared components render under SSR with the shared store). Check `/tmp/vite-blog-dev.log` for errors (hydration mismatch, missing Tailwind classes, unresolved `examples-shared`). Then stop the dev server: `pkill -f "tsx ./server/index.ts"` (or find and kill the pid). Report the curl outputs.

- [ ] **Step 6: monorepo gate** — `pnpm turbo check-types lint build --filter=vite-blog-framework` → all pass. (No `test` target of substance here; `examples-shared` and library packages are unaffected. Optionally run `pnpm turbo check-types --filter=examples-shared` to confirm the shared package still type-checks — it should, unchanged.)

- [ ] **Step 7: commit**
```bash
git add examples/vite-blog-framework/src/entry-server.tsx examples/vite-blog-framework/src/entry-client.tsx
git commit -m "chore(vite-blog): finalize shared-package migration + verify SSR/build" --allow-empty
```
(`--allow-empty` in case the entries needed no edits — keeps a clean phase-closing commit; drop the flag if there are real changes.)

---

## Self-Review Notes

- **Spec coverage:** vite now consumes `examples-shared` UI + shared Zod models/states (single source), fetches via its own typed `hc<AppType>` RPC client (client side), injects per-example behavior via `BlogProvider` (navigate + onAddComment) and fetchers-as-props, and keeps create/edit/delete additively through the components' `header`/`renderItemActions`/`renderCommentActions`/`actions` slots. The live/SSR/websocket/grants machinery is untouched.
- **The `defineResource({ model })` linchpin is exercised:** `postResource`/`userResource`/`commentResource` bind Drizzle tables to the SHARED models; `live.grant`, patch, and stale all route into the shared stores (keyed by name "post"/"user"/"comment"). This is the real-app validation Phase 1 was built for. The DB carries an extra `createdAt` column the shared model omits — allowed because Phase 1 made the resource row follow the injected model.
- **Field-name reconciliation:** DB renamed to `userId` / comment `name`; API create/comment payloads, `NewPostForm`, and fetchers all updated in lockstep. Comment author is `name` end-to-end; `onAddComment` uses `{ name, body }`.
- **Bundle safety:** `import type { AppType }` is erased (`verbatimModuleSyntax`), so the Hono app / `node:crypto` / pglite never reach the client bundle; the SSR data read uses the existing `isServer` dynamic-import branch.
- **Known-risk areas flagged for the implementer:** (1) Vite processing the source workspace package (`ssr.noExternal` + `optimizeDeps.exclude`, verified by build); (2) Tailwind scanning the shared package (`@source`, verified by the dev smoke rendering shadcn-styled HTML); (3) cross-tsconfig-project type import of `AppType` (Task 4 Step 3, with a documented fallback); (4) branded-id boundary casts in `App.tsx` (Task 5 Step 7). Each has an explicit verification or fallback.
- **Mid-refactor red:** check-types is intentionally not green after Tasks 2–4 in isolation (interdependent renames); it returns to exit 0 at Task 5 Step 8 and is hard-gated in Task 6.
- **Out of scope (Phase 4):** next-blog / rr7-blog / waku-blog migrations (own Hono app + in-memory store + `hc` both sides + shared components under RSC).
