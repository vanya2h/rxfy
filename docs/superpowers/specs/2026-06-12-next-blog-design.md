# Next.js Blog Example — Design Spec

**Date:** 2026-06-12
**Status:** Approved

## Overview

A Next.js App Router blog example demonstrating rxfy's parameterized state, normalized model stores, streaming SSR via `HydrationStream`, and local mutations. Entities: posts, users, comments. Interactions: browse posts list, view post detail, add a comment.

---

## File Structure

```
examples/next-blog/
├── package.json
├── next.config.ts
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── layout.tsx                # root layout — renders RxfyProvider (Server Component)
│   │   ├── page.tsx                  # posts list page (Server Component)
│   │   └── posts/
│   │       └── [id]/
│   │           └── page.tsx          # post detail page (Server Component)
│   ├── providers.tsx                 # "use client" — StoreProvider + HydrationStream
│   ├── db.ts                         # in-memory data: Post[], User[], Comment[]
│   ├── blog.ts                       # createModel, defineState, fetchers, mutations
│   └── components/
│       ├── PostList.tsx              # "use client" — useStateData(postsState)
│       ├── PostDetail.tsx            # "use client" — useStateData(postDetailState)
│       └── AddCommentForm.tsx        # "use client" — calls addComment mutation
```

---

## Data Layer

### Zod Schemas (`db.ts`)

```ts
const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.string() });
const PostSchema = z.object({ id: z.string(), userId: z.string(), title: z.string(), body: z.string() });
const CommentSchema = z.object({ id: z.string(), postId: z.string(), name: z.string(), body: z.string() });
```

### Seed Data

- 3 users
- 5 posts (each referencing a user by `userId`)
- 10 comments (distributed across posts by `postId`)

All hardcoded in `db.ts` as module-level arrays. Mutations append to those arrays in-process.

### rxfy Models (`blog.ts`)

```ts
export const userModel = createModel(UserSchema, { getKey: (x) => x.id, name: "user" });
export const postModel = createModel(PostSchema, { getKey: (x) => x.id, name: "post" });
export const commentModel = createModel(CommentSchema, { getKey: (x) => x.id, name: "comment" });
```

All three share one `ModelRegistry` (from `StoreProvider`) so entities written by any state are immediately visible across the app.

---

## State Definitions & Fetchers

### Posts List (`postsState`)

```ts
export const postsState = defineState({
  key: "posts",
  params: z.object({}),
  model: { posts: array(postModel) },
  mutations: {},
});

export async function fetchPosts(_: {}, signal: AbortSignal): Promise<{ posts: Post[] }>;
// Returns all posts. Simulated ~400ms latency.
```

### Post Detail (`postDetailState`)

```ts
export const postDetailState = defineState({
  key: "post-detail",
  params: z.object({ postId: z.string() }),
  model: { post: postModel, author: userModel, comments: array(commentModel) },
  mutations: {
    addComment: (prev, comment: Comment) => ({
      ...prev,
      comments: [...prev.comments, comment],
    }),
  },
});

export async function fetchPostDetail(
  { postId }: { postId: string },
  signal: AbortSignal,
): Promise<{ post: Post; author: User; comments: Comment[] }>;
// Returns post + its author + its comments. Simulated ~400ms latency.
```

### Comment creation helper

```ts
export function createComment(postId: string, name: string, body: string): Comment;
// Appends to in-memory db. Returns the new Comment with a generated id.
```

---

## Next.js App Router Wiring

### `providers.tsx` (Client Component)

```tsx
"use client";
export function RxfyProvider({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider ssr>
      <HydrationStream />
      {children}
    </StoreProvider>
  );
}
```

`HydrationStream` uses `useServerInsertedHTML` to emit incremental `<script>` tags pushing rxfy state deltas as Suspense boundaries resolve during streaming SSR.

### `app/layout.tsx` (Server Component)

```tsx
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <RxfyProvider>{children}</RxfyProvider>
      </body>
    </html>
  );
}
```

### `app/page.tsx` (Server Component)

```tsx
export default function HomePage() {
  return <PostList />;
}
```

### `app/posts/[id]/page.tsx` (Server Component)

```tsx
export default function PostPage({ params }: { params: { id: string } }) {
  return <PostDetail postId={params.id} />;
}
```

---

## Components

### `PostList` (Client Component)

- Calls `useStateData(postsState, fetchPosts, {})`
- Renders via `<Pending pending={…} rejected={…}>`
- Each post: title as `<Link href="/posts/[id]">`, truncated body snippet, author name resolved reactively via `useModelStore(userModel).get(post.userId)`

### `PostDetail` (Client Component)

- Accepts `postId: string` prop
- Calls `useStateData(postDetailState, fetchPostDetail, { postId })`
- Renders: post title + full body, author name + email, list of comments (commenter name + body)
- Renders `<AddCommentForm>` below the comment list

### `AddCommentForm` (Client Component)

- Controlled form: `name` (string) + `body` (string) fields
- Validation: both fields must be non-empty before submit
- On submit: calls `createComment(postId, name, body)`, then fires `mutations.addComment(newComment)`
- New comment appears instantly — no re-fetch

---

## Error & Loading States

- `<Pending pending={<p>Loading…</p>} rejected={({ onReload }) => <button onClick={onReload}>Retry</button>}>` on both `PostList` and `PostDetail`
- SSR renders with data already resolved (buffered), so loading state is only visible on client-side navigations

---

## Out of Scope

- Pagination
- Delete post / delete comment
- Authentication
- Persistent storage
- Global navigation bar
