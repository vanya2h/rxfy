# rxfy + Next.js blog example

A Next.js App Router blog using **rxfy** for normalized, reactive state with streaming SSR
hydration **and live updates**. Companion to the `waku-blog` (Waku) and `rr7-blog`
(React Router 7) examples — same domain, three frameworks.

## What it shows

- **RSC pages fetch, views seed from props.** Each page fetches through the in-process typed
  client (`src/blog/api-server.ts` — hono's `app.request`, no HTTP self-call) and passes the
  result to its client view as `defaultData`, which seeds the shared store before any client
  fetch can fire. The hono endpoints (served via `app/api/[[...route]]`) are the single data
  source for both environments; a missing post becomes a real `notFound()` 404.
- **Streaming hydration** — `HydrationStream` (from `rxfy-react/next`) carries the store
  snapshot to the browser via `useServerInsertedHTML`.
- **Dynamic rendering, per-visitor sessions** — every request mints a live session
  (`force-dynamic` on the home page), so pages can't be statically prerendered.

## Live updates

Plain `next dev`/`next start` can't host a WebSocket, so `server.mts` is a custom server:
Next's request handler for pages, `/live` upgraded to the rxfy WebSocket, one shared in-memory
hub (`src/server/live.ts`, bridged across Next's bundles via globalThis). The loop:

1. Each RSC render mints a session and fetches with it; the api routes register what they serve
   under that session (`subscribeRead` — serving = subscribing).
2. `<LiveSession session={…}>` (a client component) adopts the session in the browser: the live
   socket re-hellos with it, and `sessionHeaders()` carries it on client refetches.
3. Posting a comment `touchState`s the post-detail channel — every session that was served that
   post gets a `stale` push and shows the "new comment — refresh" badge; `applyUpdates()`
   refetches (and re-registers).

## Run

```bash
pnpm --filter rxfy-example-next-blog dev      # custom server, Next dev mode
pnpm --filter rxfy-example-next-blog build    # next build
pnpm --filter rxfy-example-next-blog start    # custom server, production
pnpm --filter rxfy-example-next-blog test     # SSR + live end-to-end smoke tests
```
