# rxfy + React Router 7 (SSR) example

A React Router v7 app (framework mode, buffered SSR) where **rxfy is the single data
layer** and React Router handles **routing only**.

## The idea

| Concern                                    | Owner                               |
| ------------------------------------------ | ----------------------------------- |
| Fetching domain data (server _and_ client) | rxfy `useStateData` + `fetchFn`     |
| Normalization, caching, dehydrate/hydrate  | rxfy `ModelRegistry`                |
| Routing, URL params, redirects, 404s       | RR7 `loader()` (no data fetching)   |
| HTML shell, render, client bundle          | RR7 `entry.server` / `entry.client` |

There is **no `loader → useLoaderData` data transport and no `defaultData` hand-off**.
rxfy fetches inside render on both the server and the client.

## How SSR works here

1. `app/entry.server.tsx` creates a per-request rxfy `ModelRegistry` and renders the app
   inside `<StoreProvider registry={registry} ssr>` with `renderToPipeableStream` +
   **`onAllReady`** (buffered).
2. `useStateData` suspends on each uncached query; `onAllReady` fires once every fetch has
   settled.
3. The full HTML is buffered and `hubHydration(hub, registry)` is injected before `</body>` —
   one call that mints this render's live session, registers every channel the render logged
   under it, and returns the snapshot script with the session embedded.
4. `app/entry.client.tsx` wraps `<HydratedRouter>` in `<StoreProvider ssr registry liveClient>`,
   which drains the snapshot synchronously → **no client refetch on first paint** — and adopts
   the SSR session for the live socket.

`StoreProvider` lives in the **entry points** (not `root.tsx`) because the per-request
registry must be created server-side in `entry.server.tsx` so it can be dehydrated.

## Live updates

`server.mts` is a custom hono server (`react-router-serve` can't host a WebSocket): vite
middleware + the RR request handler for pages, `/live` upgraded to the rxfy WebSocket. The api
routes register each read's channel under the requesting session (`subscribeRead` — serving =
subscribing), SSR renders register through `hubHydration`, and posting a comment `touchState`s
the post-detail channel: every session that was served that post gets a `stale` push and shows
the "new comment — refresh" badge.

## What each piece demonstrates

- **`routes/_index.tsx`** — a routing-only loader that `redirect`s `/` → `/posts`.
- **`routes/posts.tsx`** — list route; SSR'd via suspend + dehydrate.
- **`routes/posts.$postId.tsx`** — detail route. Its loader validates the URL-param _shape_
  (404 on a non-numeric id) while rxfy owns the actual fetch and the existence check
  (`fetchPostDetail` throws → the `Pending` rejected branch). The post + author entities are
  reused from the list's `ModelStore` (only comments are freshly fetched on client
  navigation). Includes the `addComment` optimistic mutation.

## SSR gotcha: keep the query on the sync-marked `data$`

Under buffered single-pass SSR, `Pending` resolves a value at render time by _synchronously
probing_ its source observable — and only rxfy-owned observables (the query `data$`) are
marked as safe to probe. Piping `data$` through an operator such as `map` or `combineLatest`
produces a **fresh, unmarked** observable, so the probe returns nothing and the subtree
renders its pending fallback (i.e. it never appears in the SSR HTML).

Entity reads don't involve probing at all: `store.get(id)` is a synchronous `IAtom` handle
read with `useAtom`, so entities referenced by a fulfilled query are always present in the
SSR HTML:

```tsx
const [post] = useAtom(store.get(id)); // the entity's cell — stable identity, no useMemo needed
```

## Run it

```bash
pnpm --filter rxfy-example-rr7-blog dev      # dev server
pnpm --filter rxfy-example-rr7-blog build    # production build
pnpm --filter rxfy-example-rr7-blog start    # serve the production build
```
