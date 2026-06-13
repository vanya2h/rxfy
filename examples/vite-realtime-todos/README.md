# rxfy — realtime todos

Normalized rxfy state driven by **server-pushed updates over WebSockets**, with targeted
per-connection delivery. Built with Vite SSR · Hono · Drizzle (SQLite, in-memory).

See the guide: [Live updates over WebSockets](../../apps/docs/src/pages/guides/live-updates-websockets.mdx).

## Run

```bash
pnpm install            # from the repo root
pnpm --filter rxfy-example-realtime-todos dev
# open http://localhost:5175 in TWO browser tabs
```

Toggle a todo's checkbox or double-click its title to rename it in one tab — it updates in the
other **instantly**, with no list refetch. The server pushes that entity only to the
connections that fetched it.

## How it works

- **Single process.** One Hono Node server (port 5175) serves SSR (Vite in middleware mode),
  the REST API, and the `/ws` WebSocket — see `server/index.ts`.
- **SSR first paint.** `useStateData` fetches `/api/todos`; the server renders the fulfilled
  list and inlines a hydration script — no loading flash.
- **Targeted live updates.** The client opens one WebSocket and tells the server which entity
  ids it depends on (`{ type: "add", topics }`, topic = `todo:<id>`). It derives those ids
  straight from the model store: `registry.added$` emits every entity that lands in the store
  (initial fetch, hydration, or a push), so the connection stays live on exactly what it has
  loaded — no per-query wiring (`src/live/useStoreSubscriptions.ts`). The server keeps **one
  dependency set per connection** and, on a change, pushes the entity only to the connections
  whose set includes it (`server/hub.ts`, `publish` is O(connections)). Each client applies the
  push with `store.setMany`, so every subscriber of that entity re-renders — no refetch, no
  re-select.

## The boundary: values vs. list membership

A push updates an entity's **value** (toggle, rename) and reaches every subscriber. It does
**not** change which ids a query lists — `data$` is an id array owned by the query cache. So:

- **Adding / removing** a todo updates the acting tab locally (a `useStateData` mutation +
  the REST write) and **other tabs pick it up on Reload**.
- Live cross-tab list membership would need a separate list-level message; the per-entity
  socket here is the deliberate sweet spot.

## Layout

```
shared/todo.ts        zod schema shared by client model + server
server/db.ts          drizzle schema + in-memory sqlite + seed
server/hub.ts         per-connection dependency sets + targeted publish
server/index.ts       hono: SSR + REST API + /ws (single process)
src/models.ts         createModel / defineState / fetch + REST helpers
src/live/             liveClient, LiveProvider, useStoreSubscriptions, useLiveEntities
src/App.tsx           the todo UI (entity-per-cell subscriptions)
src/entry-*.tsx       SSR server + client entries
```
