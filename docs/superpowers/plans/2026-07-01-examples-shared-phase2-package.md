# examples-shared Phase 2 — Shared Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `examples/example-shared` (workspace `examples-shared`) — a **source** package holding the shared shadcn UI + theme, the single-source Zod data (models/states/types/seed), and the injected read components (`BlogProvider` + `PostList`/`PostItem`/`PostDetail`/`CommentItem`/`AddCommentForm`/`UpdatesBadge`). No fetch/RPC/DB.

**Architecture:** Extract `vite-blog-framework`'s working shadcn UI (`ui/*` + `lib/utils` + theme CSS) into the package with **relative** internal imports (no `@/` — safe for source consumption across bundlers). Add the shared Zod data. Add read components parameterized by a `BlogProvider` context (`navigate`, `onAddComment`) and props (`fetchPosts`/`fetchPostDetail`, optional `actions` slots). Consumed as source (apps transpile; `"use client"` preserved; Tailwind `@source`-scans the package).

**Tech Stack:** React 19, rxfy + rxfy-react (workspace), zod, RxJS, shadcn/ui (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`, `@fontsource-variable/geist`, `shadcn`), Tailwind v4, Vitest.

Spec: `docs/superpowers/specs/2026-07-01-examples-shared-design.md` §5–§7. Phase 2 of 4. Depends on Phase 1 (`defineResource({ model })`, already merged). **Reference (copy-from):** `examples/vite-blog-framework/src/components/ui/*`, `src/lib/utils.ts`, `src/styles.css`.

---

## File Structure

```
examples/example-shared/
  package.json  tsconfig.json  eslint.config.ts
  src/
    styles.css              # Tailwind + shadcn theme (copied from vite)
    lib/utils.ts            # cn (copied)
    ui/*.tsx                # shadcn primitives (copied, @/ -> relative)
    data/
      models.ts            # Zod schemas + ids + types + createModel
      states.ts            # postsState, postDetailState
      seed.ts              # canonical users/posts/comments
      index.ts             # barrel
      seed.test.ts         # data-shape smoke test
    blog/
      BlogContext.tsx       # BlogProvider / useBlog
      UpdatesBadge.tsx  AddCommentForm.tsx  CommentItem.tsx  PostItem.tsx  PostDetail.tsx  PostList.tsx
      index.ts
    index.ts                # top barrel
```

---

## Task 1: Scaffold the package

**Files:** `package.json`, `tsconfig.json`, `eslint.config.ts`, placeholder `src/index.ts`.

- [ ] **Step 1: `examples/example-shared/package.json`**

```json
{
  "name": "examples-shared",
  "version": "0.0.0",
  "private": true,
  "description": "Shared UI, data, and components for the rxfy blog examples",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./data": "./src/data/index.ts",
    "./ui/*": "./src/ui/*.tsx",
    "./lib/utils": "./src/lib/utils.ts",
    "./styles.css": "./src/styles.css"
  },
  "scripts": {
    "check-types": "tsc --noEmit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@fontsource-variable/geist": "^5.2.9",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.22.0",
    "radix-ui": "^1.6.1",
    "tailwind-merge": "^3.6.0",
    "tw-animate-css": "^1.4.0"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxjs": "^7.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.17",
    "@vanya2h/eslint-config": "^0.7.0",
    "eslint": "^9.27.0",
    "react": "^19.2.7",
    "rxfy": "workspace:*",
    "rxfy-react": "workspace:*",
    "rxjs": "^7.8.2",
    "shadcn": "^4.12.0",
    "tailwindcss": "^4.3.2",
    "typescript": "^5.8.3",
    "vitest": "^3.1.4",
    "zod": "^4.4.3"
  }
}
```

> Consumed as **source** (`exports` point at `.ts`/`.tsx`), so consuming apps transpile it. `styles.css` is exported for `import "examples-shared/styles.css"`.

- [ ] **Step 2: `tsconfig.json`** — a DOM+React config that can type-check the components (mirror `examples/vite-blog-framework/tsconfig.app.json`'s compilerOptions, but self-contained with `noEmit`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "types": ["vitest/globals"],
    "strict": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `eslint.config.ts`** (mirror the vite example's, ignoring the copied shadcn `ui`/`lib`):

```ts
import { config } from "@vanya2h/eslint-config/react";
import { Linter } from "eslint";

export default [
  ...config,
  { ignores: ["dist/**", ".turbo/**", "node_modules/**", "src/ui/**", "src/lib/utils.ts"] },
] satisfies Linter.Config[];
```

- [ ] **Step 4: placeholder `src/index.ts`** → `export {};`

- [ ] **Step 5: install + verify**
      Run `pnpm install`, then `pnpm --filter examples-shared check-types` (0) and `pnpm --filter examples-shared lint` (clean).

- [ ] **Step 6: commit**

```bash
git add examples/example-shared pnpm-lock.yaml
git commit -m "chore(examples-shared): scaffold shared package"
```

---

## Task 2: Copy shadcn UI + theme (relative imports)

**Files:** `src/lib/utils.ts`, `src/ui/*.tsx`, `src/styles.css`.

- [ ] **Step 1: copy `lib/utils.ts`** — copy `examples/vite-blog-framework/src/lib/utils.ts` verbatim to `examples/example-shared/src/lib/utils.ts`.

- [ ] **Step 2: copy the 7 ui components** — copy each of `examples/vite-blog-framework/src/components/ui/{badge,button,card,input,select,separator,textarea}.tsx` to `examples/example-shared/src/ui/`. Then in EACH copied file, rewrite the cn import from `import { cn } from "@/lib/utils"` to `import { cn } from "../lib/utils.js"`. If any ui file imports another ui file via `@/components/ui/x`, rewrite to `./x.js`. (grep the copied files for `@/` afterward — none should remain.)

- [ ] **Step 3: copy `styles.css`** — copy `examples/vite-blog-framework/src/styles.css` verbatim to `examples/example-shared/src/styles.css`. It begins with `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css"; @custom-variant dark (...)` + the neutral theme `:root`/`.dark`/`@theme` blocks + the Geist font var.

- [ ] **Step 4: verify** — `pnpm --filter examples-shared check-types` (0 errors; ui files resolve `radix-ui`/`cva`/`lucide`/relative cn) and `pnpm --filter examples-shared lint` (clean — ui/lib are ignored). Run `grep -rn '@/' examples/example-shared/src/ui examples/example-shared/src/lib || echo "no @/ (good)"` → `no @/ (good)`.

- [ ] **Step 5: commit**

```bash
git add examples/example-shared/src/lib examples/example-shared/src/ui examples/example-shared/src/styles.css
git commit -m "feat(examples-shared): shadcn ui primitives + theme (relative imports)"
```

---

## Task 3: Shared data (models/states/seed) + smoke test

**Files:** `src/data/{models,states,seed,index}.ts`, `src/data/seed.test.ts`.

- [ ] **Step 1: `src/data/models.ts`**

```ts
import { createModel } from "rxfy";
import { z } from "zod";

export const UserIdSchema = z.string().brand("UserId");
export const PostIdSchema = z.string().brand("PostId");
export const CommentIdSchema = z.string().brand("CommentId");
export type UserId = z.infer<typeof UserIdSchema>;
export type PostId = z.infer<typeof PostIdSchema>;
export type CommentId = z.infer<typeof CommentIdSchema>;

export const UserSchema = z.object({ id: UserIdSchema, name: z.string(), email: z.string() });
export const PostSchema = z.object({ id: PostIdSchema, userId: UserIdSchema, title: z.string(), body: z.string() });
export const CommentSchema = z.object({
  id: CommentIdSchema,
  postId: PostIdSchema,
  name: z.string(),
  body: z.string(),
});
export type User = z.infer<typeof UserSchema>;
export type Post = z.infer<typeof PostSchema>;
export type Comment = z.infer<typeof CommentSchema>;

export const userModel = createModel({ schema: UserSchema, getKey: (x) => x.id, name: "user" });
export const postModel = createModel({ schema: PostSchema, getKey: (x) => x.id, name: "post" });
export const commentModel = createModel({ schema: CommentSchema, getKey: (x) => x.id, name: "comment" });
```

- [ ] **Step 2: `src/data/states.ts`**

```ts
import { array, defineState, single } from "rxfy";
import { z } from "zod";
import { commentModel, PostIdSchema, postModel, userModel } from "./models.js";

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
});
```

- [ ] **Step 3: `src/data/seed.ts`** (canonical content; branded ids via `as`)

```ts
import type { Comment, CommentId, Post, PostId, User, UserId } from "./models.js";

export const seedUsers: User[] = [
  { id: "1" as UserId, name: "Alice Doe", email: "alice@example.com" },
  { id: "2" as UserId, name: "Bob Smith", email: "bob@example.com" },
  { id: "3" as UserId, name: "Carol Lee", email: "carol@example.com" },
];

export const seedPosts: Post[] = [
  {
    id: "1" as PostId,
    userId: "1" as UserId,
    title: "Getting Started with rxfy",
    body: "rxfy is a stream-based, normalized state library built on RxJS. This post walks through Atoms, Lenses, and normalized stores.",
  },
  {
    id: "2" as PostId,
    userId: "2" as UserId,
    title: "RxJS Patterns in 2025",
    body: "Reactive programming has matured: clean operator chains, minimal subscription management, and colocated teardown win.",
  },
  {
    id: "3" as PostId,
    userId: "1" as UserId,
    title: "Streaming SSR with React 19",
    body: "React 19 makes streaming server rendering first-class; combined with Suspense you deliver fast loads without waterfalls.",
  },
  {
    id: "4" as PostId,
    userId: "3" as UserId,
    title: "Zod for Runtime Type Safety",
    body: "TypeScript is compile-time; Zod fills the runtime gap with a chainable schema API that doubles as a parser.",
  },
  {
    id: "5" as PostId,
    userId: "2" as UserId,
    title: "Normalized State, Explained",
    body: "Keeping entities in id-keyed stores and pages as id-lists keeps updates cheap and caches shareable.",
  },
];

export const seedComments: Comment[] = [
  {
    id: "1" as CommentId,
    postId: "1" as PostId,
    name: "Bob Smith",
    body: "Great intro! The Atom primitive reminds me of Jotai.",
  },
  {
    id: "2" as CommentId,
    postId: "1" as PostId,
    name: "Carol Lee",
    body: "Does rxfy support derived state like Recoil selectors?",
  },
  { id: "3" as CommentId, postId: "2" as PostId, name: "Alice Doe", body: "The operator-chain examples are clean." },
];
```

- [ ] **Step 4: `src/data/index.ts`**

```ts
export * from "./models.js";
export * from "./seed.js";
export * from "./states.js";
```

- [ ] **Step 5: `src/data/seed.test.ts`** — a data-shape smoke test (models normalize the seed; state query shapes are ids):

```ts
import { createModelRegistry, normalizeResult } from "rxfy";
import { describe, expect, it } from "vitest";
import { postModel, userModel } from "./models.js";
import { seedComments, seedPosts, seedUsers } from "./seed.js";
import { postDetailState, postsState } from "./states.js";

describe("shared blog data", () => {
  it("seed content is present and consistent", () => {
    expect(seedPosts).toHaveLength(5);
    expect(seedUsers).toHaveLength(3);
    // every post's author exists
    for (const p of seedPosts) expect(seedUsers.some((u) => u.id === p.userId)).toBe(true);
    // every comment's post exists
    for (const c of seedComments) expect(seedPosts.some((p) => p.id === c.postId)).toBe(true);
  });

  it("postsState normalizes to id lists + plain meta", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, postsState.fields, {
      posts: seedPosts,
      authors: seedUsers,
      meta: { total: seedPosts.length, generatedAt: "t" },
    });
    expect(ids.posts).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids.authors).toEqual(["1", "2", "3"]);
    expect(ids.meta).toEqual({ total: 5, generatedAt: "t" });
    expect(registry.model(postModel).getValue("1")).toMatchObject({ title: "Getting Started with rxfy" });
    expect(registry.model(userModel).getValue("1")).toMatchObject({ name: "Alice Doe" });
  });

  it("postDetailState normalizes single + array fields to ids", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, postDetailState.fields, {
      post: seedPosts[0],
      author: seedUsers[0],
      comments: seedComments.filter((c) => c.postId === ("1" as typeof c.postId)),
    });
    expect(ids.post).toBe("1");
    expect(ids.author).toBe("1");
    expect(ids.comments).toEqual(["1", "2"]);
  });
});
```

- [ ] **Step 6: verify + commit**
      Run `pnpm --filter examples-shared exec vitest run src/data/seed.test.ts` (pass), `pnpm --filter examples-shared check-types` (0), `pnpm --filter examples-shared lint` (fix + re-lint clean).

```bash
git add examples/example-shared/src/data
git commit -m "feat(examples-shared): shared Zod models, states, seed + data smoke test"
```

---

## Task 4: Shared components + BlogProvider

**Files:** `src/blog/*.tsx`, `src/blog/index.ts`, `src/index.ts`.

- [ ] **Step 1: `src/blog/BlogContext.tsx`**

```tsx
"use client";
import { createContext, useContext, type ReactNode } from "react";

export type BlogContextValue = {
  navigate: (path: string) => void;
  onAddComment: (postId: string, input: { name: string; body: string }) => void | Promise<void>;
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

- [ ] **Step 2: `src/blog/UpdatesBadge.tsx`**

```tsx
"use client";
import { RefreshCw } from "lucide-react";
import { useObservable } from "rxfy-react";
import type { Observable } from "rxjs";
import { Button } from "../ui/button.js";

export function UpdatesBadge({
  available$,
  onApply,
  noun,
}: {
  available$: Observable<number>;
  onApply: () => void;
  noun: string;
}) {
  const n = useObservable(available$, 0);
  if (n <= 0) return null;
  return (
    <Button variant="secondary" size="sm" onClick={onApply}>
      <RefreshCw data-icon="inline-start" />
      {n} new {noun}
      {n === 1 ? "" : "s"} · refresh
    </Button>
  );
}
```

- [ ] **Step 3: `src/blog/AddCommentForm.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import { useBlog } from "./BlogContext.js";

export function AddCommentForm({ postId }: { postId: string }) {
  const { onAddComment } = useBlog();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    await onAddComment(postId, { name: name.trim(), body: body.trim() });
    setName("");
    setBody("");
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your comment…" />
      <Button type="submit" size="sm" className="self-start">
        Post comment
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: `src/blog/CommentItem.tsx`**

```tsx
"use client";
import { useMemo, type ReactNode } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { commentModel, type CommentId } from "../data/models.js";

export function CommentItem({ id, actions }: { id: CommentId; actions?: ReactNode }) {
  const store = useModelStore(commentModel);
  const comment$ = useMemo(() => store.get(id), [store, id]);
  return (
    <Pending value$={comment$} pending={<p className="text-muted-foreground">Loading…</p>}>
      {(comment) => (
        <div className="flex items-start justify-between gap-2 rounded-md border p-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium">{comment.name}</p>
            <p className="text-muted-foreground">{comment.body}</p>
          </div>
          {actions}
        </div>
      )}
    </Pending>
  );
}
```

- [ ] **Step 5: `src/blog/PostItem.tsx`**

```tsx
"use client";
import { useMemo, type ReactNode } from "react";
import { Pending, useModelStore } from "rxfy-react";
import { postModel, userModel, type PostId, type UserId } from "../data/models.js";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card.js";
import { useBlog } from "./BlogContext.js";

export function PostItem({ id, actions }: { id: PostId; actions?: ReactNode }) {
  const { navigate } = useBlog();
  const store = useModelStore(postModel);
  const post$ = useMemo(() => store.get(id), [store, id]);
  return (
    <Pending value$={post$} pending={<p className="text-muted-foreground">Loading…</p>}>
      {(post) => (
        <Card>
          <CardHeader>
            <CardTitle>
              <a
                href={`/posts/${post.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/posts/${post.id}`);
                }}
                className="hover:underline"
              >
                {post.title}
              </a>
            </CardTitle>
            <CardDescription>
              <Author userId={post.userId} />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{post.body.slice(0, 140)}…</p>
          </CardContent>
          {actions && <CardFooter className="gap-2">{actions}</CardFooter>}
        </Card>
      )}
    </Pending>
  );
}

function Author({ userId }: { userId: UserId }) {
  const store = useModelStore(userModel);
  const author$ = useMemo(() => store.get(userId), [store, userId]);
  return (
    <Pending value$={author$} pending={<span>…</span>}>
      {(a) => <span>by {a.name}</span>}
    </Pending>
  );
}
```

- [ ] **Step 6: `src/blog/PostList.tsx`**

```tsx
"use client";
import { type ReactNode } from "react";
import { Pending, useStateData } from "rxfy-react";
import { type Post, type PostId, type User } from "../data/models.js";
import { postsState } from "../data/states.js";
import { PostItem } from "./PostItem.js";
import { UpdatesBadge } from "./UpdatesBadge.js";

export type PostsData = { posts: Post[]; authors: User[]; meta: { total: number; generatedAt: string } };
export type PostsFetcher = (params: Record<never, never>, signal: AbortSignal) => Promise<PostsData>;

export function PostList({
  fetchPosts,
  header,
  renderItemActions,
}: {
  fetchPosts: PostsFetcher;
  header?: ReactNode;
  renderItemActions?: (id: PostId) => ReactNode;
}) {
  const handle = useStateData({ state: postsState, fetchFn: fetchPosts, params: {} });
  return (
    <div className="flex flex-col gap-4">
      <UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="post" />
      {header}
      <Pending
        value$={handle.data$}
        pending={<p className="text-muted-foreground">Loading posts…</p>}
        rejected={() => <p className="text-destructive">Failed to load.</p>}
      >
        {({ posts, meta }) =>
          posts.length === 0 ? (
            <p className="text-muted-foreground">No posts yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground text-sm">
                {meta.total} posts · loaded {new Date(meta.generatedAt).toLocaleTimeString()}
              </p>
              {posts.map((id) => (
                <PostItem key={id} id={id} actions={renderItemActions?.(id)} />
              ))}
            </div>
          )
        }
      </Pending>
    </div>
  );
}
```

- [ ] **Step 7: `src/blog/PostDetail.tsx`**

```tsx
"use client";
import { useMemo, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { combineLatest } from "rxjs";
import {
  type Comment,
  commentModel,
  type CommentId,
  type Post,
  postModel,
  type PostId,
  type User,
  userModel,
} from "../data/models.js";
import { postDetailState } from "../data/states.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js";
import { Separator } from "../ui/separator.js";
import { AddCommentForm } from "./AddCommentForm.js";
import { useBlog } from "./BlogContext.js";
import { CommentItem } from "./CommentItem.js";
import { UpdatesBadge } from "./UpdatesBadge.js";

export type PostDetailData = { post: Post; author: User; comments: Comment[] };
export type PostDetailFetcher = (params: { postId: PostId }, signal: AbortSignal) => Promise<PostDetailData>;
type DetailIds = { post: PostId; author: UserId; comments: CommentId[] };

export function PostDetail({
  postId,
  fetchPostDetail,
  actions,
  renderCommentActions,
}: {
  postId: PostId;
  fetchPostDetail: PostDetailFetcher;
  actions?: ReactNode;
  renderCommentActions?: (id: CommentId) => ReactNode;
}) {
  const { navigate } = useBlog();
  const params = useMemo(() => ({ postId }), [postId]);
  const handle = useStateData({ state: postDetailState, fetchFn: fetchPostDetail, params });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft data-icon="inline-start" />
          All posts
        </Button>
        <UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="comment" />
      </div>
      <Pending
        value$={handle.data$}
        pending={<p className="text-muted-foreground">Loading…</p>}
        rejected={() => <p className="text-destructive">Failed to load.</p>}
      >
        {(ids) => <Article ids={ids as DetailIds} actions={actions} renderCommentActions={renderCommentActions} />}
      </Pending>
    </div>
  );
}

function Article({
  ids,
  actions,
  renderCommentActions,
}: {
  ids: DetailIds;
  actions?: ReactNode;
  renderCommentActions?: (id: CommentId) => ReactNode;
}) {
  const postStore = useModelStore(postModel);
  const userStore = useModelStore(userModel);
  const both$ = useMemo(
    () => combineLatest({ post: postStore.get(ids.post), author: userStore.get(ids.author) }),
    [postStore, userStore, ids.post, ids.author],
  );
  return (
    <Pending value$={both$}>
      {({ post, author }) => (
        <Card>
          <CardHeader>
            <CardTitle>{post.title}</CardTitle>
            <CardDescription>by {author.name}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {actions}
            <p>{post.body}</p>
            <Separator />
            <h3 className="font-medium">Comments ({ids.comments.length})</h3>
            <div className="flex flex-col gap-2">
              {ids.comments.map((cid) => (
                <CommentItem key={cid} id={cid} actions={renderCommentActions?.(cid)} />
              ))}
            </div>
            <AddCommentForm postId={post.id} />
          </CardContent>
        </Card>
      )}
    </Pending>
  );
}
```

> `useStateData(postDetailState).data$` emits the query shape `{ post: PostId; author: UserId; comments: CommentId[] }`; the `ids as DetailIds` narrows it. If TS already infers `DetailIds` exactly, drop the cast (report which).

- [ ] **Step 8: `src/blog/index.ts`**

```ts
export * from "./AddCommentForm.js";
export * from "./BlogContext.js";
export * from "./CommentItem.js";
export * from "./PostDetail.js";
export * from "./PostItem.js";
export * from "./PostList.js";
export * from "./UpdatesBadge.js";
```

- [ ] **Step 9: top barrel `src/index.ts`** (replace the placeholder)

```ts
export * from "./blog/index.js";
export * from "./data/index.js";
```

- [ ] **Step 10: verify + commit**
      Run `pnpm --filter examples-shared check-types` (0 — resolve the one `DetailIds` cast if needed) and `pnpm --filter examples-shared lint` (`eslint . --fix` then re-lint; clean; verify exit code, don't pipe through `tail`).

```bash
git add examples/example-shared/src/blog examples/example-shared/src/index.ts
git commit -m "feat(examples-shared): BlogProvider + shared read components"
```

---

## Task 5: Final verification

- [ ] **Step 1: whole-package gate**
      Run `pnpm turbo test check-types lint --filter=examples-shared` — all pass (data smoke test; types; lint). (No `build` — source package.)
- [ ] **Step 2: confirm no `@/` leaked into shared source** — `grep -rn '@/' examples/example-shared/src || echo "no @/ (good)"` → `no @/ (good)`.
- [ ] **Step 3: confirm the public surface imports** — `node --input-type=module -e "console.log('ok')"` is not enough for a source package; instead confirm the barrel type-resolves by checking `pnpm --filter examples-shared check-types` passed (step 1). Done.

---

## Self-Review Notes

- **Spec coverage:** §5 data (models/states/types in `data/models.ts` + seed), §6 components (`BlogProvider` context `{navigate,onAddComment}`; `fetchPosts`/`fetchPostDetail` as props; `UpdatesBadge` inert without a live client; optional `actions`/`header`/`renderItemActions`/`renderCommentActions` slots for vite's extras), §7 shadcn (copied from vite, relative imports, theme exported). No fetch/RPC/DB. `"use client"` on all components (RSC-ready).
- **Consumption:** source package (`exports` → `.ts`/`.tsx`); apps transpile + Tailwind `@source`-scan it (wired in Phase 3/4). Relative internal imports avoid `@/` leakage — the flagged risk is eliminated by construction (Task 2/5 grep-verify).
- **Type consistency:** shared `Post` has `userId` + comment `name` (matches the three examples' convention; vite aligns in Phase 3). Component props: `PostList {fetchPosts,header,renderItemActions}`, `PostDetail {postId,fetchPostDetail,actions,renderCommentActions}`, `PostItem {id,actions}`, `CommentItem {id,actions}`, `AddCommentForm {postId}`, `UpdatesBadge {available$,onApply,noun}`, `BlogProvider {value,children}`.
- **Out of scope (Phase 3/4):** wiring each example's Hono RPC + `BlogProvider` + Tailwind `@source`; vite's `defineResource({ model })` + slot injections.
