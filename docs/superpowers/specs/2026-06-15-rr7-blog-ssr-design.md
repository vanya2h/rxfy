# RR7 + rxfy SSR Example (`examples/rr7-blog`) — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)

## Goal

Build an example app demonstrating React Router v7 (framework mode) with SSR, where
**rxfy is the single data layer** and React Router is the **router + SSR shell only**.
The example answers the open question: _how do we idiomatically handle server-side
loaders alongside `useStateData`?_ — by having rxfy own all domain-data fetching
(server and client) and reserving RR loaders for routing concerns.

## Architecture & Data Ownership

| Concern                                           | Owner                               |
| ------------------------------------------------- | ----------------------------------- |
| Fetching domain data (server _and_ client)        | rxfy `useStateData` + `fetchFn`     |
| Normalization, caching, dehydrate/hydrate         | rxfy `ModelRegistry`                |
| Routing, URL params, redirects, 404s, auth guards | RR7 `loader()` (no data fetching)   |
| HTML shell, render, client bundle                 | RR7 `entry.server` / `entry.client` |

Key decisions (from brainstorming):

- **rxfy owns SSR** via its server fetch-and-suspend path (`StoreProvider ssr`) plus
  `dehydrate`/`hydrate` — not RR's `loader → useLoaderData` data transport, and not the
  `defaultData` bridge. There is **no `defaultData` hand-off**; rxfy fetches inside render
  on both server and client.
- **Buffered render** (`renderToPipeableStream` + `onAllReady`), mapping directly onto
  rxfy SSR Mode 1. Progressive streaming is deliberately given up for determinism/simplicity.
- **Blog domain reused** from `examples/next-blog` (posts + comments), giving a direct
  side-by-side: same app under Next streaming vs RR7 buffered SSR.

### First-load (SSR) flow

1. Request → RR7 matches route → renders into customized `entry.server.tsx`.
2. Create a **per-request `ModelRegistry`**; wrap `<ServerRouter>` in
   `<StoreProvider registry={registry} ssr>`.
3. `renderToPipeableStream` with **`onAllReady`** — `useStateData` suspends on each IDLE
   query, fetches via `fetchFn`, the registry's query-cache dedups, React retries until
   all settle.
4. Buffer the full HTML, inject `hydrationScript(dehydrate(registry))` immediately before
   `</body>`, return the `Response`.
5. Client: `entry.client.tsx` wraps `<HydratedRouter>` in `<StoreProvider ssr>`; the
   snapshot drains **synchronously in `StoreProvider`'s `useState` initializer** (see
   `packages/rxfy-react/src/StoreProvider.tsx:25-32`) → `useStateData` is `FULFILLED` on
   first client render → **zero client fetch on first paint, no hydration mismatch**.

### Client-navigation flow

Navigating list → detail has no RR loader fetching data, so the detail component's
`useStateData` fetches client-side on subscribe — _except_ entities already normalized by
the list (the post + author) are `ModelStore` cache hits, so only the missing slice
(comments) is genuinely fetched.

## File Structure

```
examples/rr7-blog/
  package.json            # react-router 7, @react-router/{node,serve,dev}, vite, rxfy, rxfy-react
  vite.config.ts          # @react-router/dev vite plugin
  react-router.config.ts  # ssr: true (framework mode, server build)
  tsconfig.json, eslint.config.ts, turbo.json
  app/
    root.tsx              # <html> shell + <StoreProvider ssr> wrapping <Outlet/>; nav Links
    entry.server.tsx      # CUSTOM: per-request registry, onAllReady buffer, inject hydrationScript
    entry.client.tsx      # CUSTOM: <StoreProvider ssr><HydratedRouter/></StoreProvider>
    routes.ts             # route config (index, /posts, /posts/:postId)
    blog.ts               # COPIED from next-blog (models, states, fetchers, mutation)
    db.ts                 # COPIED from next-blog (mock data)
    routes/
      _index.tsx          # loader → redirect("/posts")            [routing-only loader]
      posts.tsx           # useStateData(postsState, fetchPosts) → PostList
      posts.$postId.tsx   # loader validates postId via Zod (404 on bad param); component
                          #   useStateData(postDetailState, fetchPostDetail) + addComment mutation
    components/
      PostList.tsx, PostDetail.tsx, AddCommentForm.tsx  # adapted from next-blog (Link not next/link)
```

## Demonstrated Patterns → Mapping

- **List + detail with shared entities** → `/posts` normalizes posts+authors;
  `/posts/:postId` reuses the post & author entities from the `ModelStore`, fetching only comments.
- **SSR-then-client-nav** → `/posts` is SSR'd (suspend+dehydrate, no first-paint fetch);
  clicking through to a post fetches client-side on subscribe.
- **Optimistic mutation** → `AddCommentForm` calls the `postDetailState.addComment` rxfy
  mutation (write-through to the normalized store), with `reload()` available.
- **Loader for routing only** → `_index` loader `redirect("/posts")`; `posts.$postId`
  loader does `PostIdSchema.parse(params.postId)` and throws a `404 Response` on an invalid
  id — **no domain fetch in either loader**.

## `entry.server.tsx` Mechanics (the one piece needing care)

Collect the `renderToPipeableStream` output into a buffer in `onAllReady`, then
string-inject `hydrationScript(dehydrate(registry))` immediately before `</body>` (so it
runs before the RR client module hydrates), and return a `Response` with the assembled
HTML. `onError`/`onShellError` handle render failures.

## Testing & Verification

This is an example app, so the bar is "demonstrably works," not unit-test coverage.

- `pnpm --filter rr7-blog build`, `turbo check-types`, `turbo lint` pass (wires into the
  existing Turbo graph).
- **No first-paint fetch:** `curl` the `/posts` HTML and assert post titles + the
  `__RXFY_SSR__` snapshot are present in the served markup (data is in the HTML).
- **No hydration mismatch / no client refetch:** load in a browser, confirm no React
  hydration warning and no data fetch in the network tab for the already-SSR'd route.
- Short `README.md` explaining the architecture and the loader/rxfy division of labor —
  this _is_ the deliverable of an example.

No new tests added to `rxfy`/`rxfy-react`; this exercises existing public APIs. Per
CLAUDE.md, **no changeset is needed** (examples are private / never published).

## Risks

1. **Script injection ordering** — `hydrationScript` must populate `window.__RXFY_SSR__`
   _before_ RR7's client module runs `hydrateRoot`. Buffered injection before `</body>`
   satisfies this; the `curl` check catches regressions. Most likely spot to need iteration.
2. **`onAllReady` vs RR7 defaults** — RR7's stock `entry.server` branches between
   `onShellReady` and `onAllReady`; we deliberately always use `onAllReady` (buffered),
   giving up progressive streaming on purpose (accepted trade-off).
3. **Suspense boundaries** — `renderToPipeableStream` + `onAllReady` tolerates a
   fully-suspending tree, so no extra `<Suspense>` is required. Partial streaming later
   would change this.
