# rxfy + Waku blog example

A [Waku](https://waku.gg) (minimal React framework, RSC-based) blog using **rxfy** for
normalized, reactive state with SSR hydration **and live updates**. Companion to the `next-blog`
(Next.js App Router) and `rr7-blog` (React Router 7) examples — same domain, three frameworks.

## What it shows

- **RSC pages fetch, views seed from props.** Each page (a Server Component) fetches through the
  in-process typed client (`src/blog/api-server.ts` — hono's `app.request`, no HTTP self-call) and
  passes the result to its client view as `defaultData`, which seeds the shared store before any
  client fetch can fire. The hono endpoints are the single data source for both environments.
- **Dynamic rendering, per-visitor sessions** — both pages are `render: "dynamic"`: every request
  mints a live session, so pages can't be statically prerendered.
- **Client navigation** — Waku `Link`; the rxfy store lives in the persistent root layout and
  survives route transitions, so seen entities are not refetched.

## Live updates

Waku owns its HTTP server, so the live WebSocket listens on a **sibling port** (8090), started by
the api middleware at boot (`src/server/ws.ts`). The loop:

1. Each RSC render mints a session and fetches with it; the api routes register what they serve
   under that session (`subscribeRead` in `src/server/live.ts` — serving = subscribing).
2. `<LiveSession session={…}>` (a client component) adopts the session in the browser: the live
   socket re-hellos with it, and `sessionHeaders()` carries it on client refetches.
3. Posting a comment `touchState`s the post-detail channel — every session that was served that
   post gets a `stale` push and shows the "new comment — refresh" badge; `applyUpdates()`
   refetches (and re-registers).

## Run

```bash
pnpm --filter rxfy-example-waku-blog dev
pnpm --filter rxfy-example-waku-blog build
pnpm --filter rxfy-example-waku-blog start
```
