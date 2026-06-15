# rxfy + React Router 7 (SSR) example

A React Router v7 app (framework mode, buffered SSR) where **rxfy is the single data
layer** and React Router handles **routing only**.

## The idea

| Concern | Owner |
|---|---|
| Fetching domain data (server *and* client) | rxfy `useStateData` + `fetchFn` |
| Normalization, caching, dehydrate/hydrate | rxfy `ModelRegistry` |
| Routing, URL params, redirects, 404s | RR7 `loader()` (no data fetching) |
| HTML shell, render, client bundle | RR7 `entry.server` / `entry.client` |

There is **no `loader → useLoaderData` data transport and no `defaultData` hand-off**.
rxfy fetches inside render on both the server and the client.

## How SSR works here

1. `app/entry.server.tsx` creates a per-request rxfy `ModelRegistry` and renders the app
   inside `<StoreProvider registry={registry} ssr>` with `renderToPipeableStream` +
   **`onAllReady`** (buffered).
2. `useStateData` suspends on each uncached query; `onAllReady` fires once every fetch has
   settled.
3. The full HTML is buffered and `hydrationScript(dehydrate(registry))` is injected before
   `</body>`.
4. `app/entry.client.tsx` wraps `<HydratedRouter>` in `<StoreProvider ssr>`, which drains
   the snapshot synchronously → **no client refetch on first paint**.

`StoreProvider` lives in the **entry points** (not `root.tsx`) because the per-request
registry must be created server-side in `entry.server.tsx` so it can be dehydrated.

## What each piece demonstrates

- **`routes/_index.tsx`** — a routing-only loader that `redirect`s `/` → `/posts`.
- **`routes/posts.tsx`** — list route; SSR'd via suspend + dehydrate.
- **`routes/posts.$postId.tsx`** — detail route. Its loader validates the URL-param *shape*
  (404 on a non-numeric id) while rxfy owns the actual fetch and the existence check
  (`fetchPostDetail` throws → the `Pending` rejected branch). The post + author entities are
  reused from the list's `ModelStore` (only comments are freshly fetched on client
  navigation). Includes the `addComment` optimistic mutation.

## SSR gotcha: keep entity reads on sync-marked observables

Under buffered single-pass SSR, `Pending` resolves a value at render time by *synchronously
probing* its source observable — and only rxfy-owned observables (the query `data$` and
`store.get(id)`) are marked as safe to probe. Combining them with an operator such as
`combineLatest` produces a **fresh, unmarked** observable, so the probe returns nothing and
the subtree renders its pending fallback (i.e. it never appears in the SSR HTML).

So in `PostDetail.tsx` the post and author are read with **nested `Pending`s** on the
sync-marked `store.get(id)` observables rather than a single `combineLatest`:

```tsx
<Pending value$={post$}>{(post) => (
  <Pending value$={author$}>{(author) => <Article post={post} author={author} />}</Pending>
)}</Pending>
```

This is the same pattern `PostList.tsx` uses, and it keeps the article server-rendered.

## Run it

```bash
pnpm --filter rxfy-example-rr7-blog dev      # dev server
pnpm --filter rxfy-example-rr7-blog build    # production build
pnpm --filter rxfy-example-rr7-blog start    # serve the production build
```
