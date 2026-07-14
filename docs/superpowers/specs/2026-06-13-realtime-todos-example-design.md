# Realtime Todos Example — Design

**Date:** 2026-06-13
**Status:** Approved (design), pending implementation plan
**Location:** `examples/vite-realtime-todos`

## Overview

A runnable example app demonstrating rxfy's normalized state driven by **server-pushed
updates over WebSockets**, using the per-connection dependency-hub design documented in
[`guides/live-updates-websockets`](../../../apps/docs/src/pages/guides/live-updates-websockets.mdx).

The headline demo: open two browser tabs, toggle or rename a todo in one, and watch it update
in the other **instantly, with no refetch** — because the server pushes that entity only to
the connections that fetched it.

## Goals

- Show the full stack the guide describes: Vite SSR client · Hono server · Drizzle persistence
  · WebSocket live updates · rxfy normalization.
- Use the **real** workspace packages (`rxfy`, `rxfy-react` via `workspace:*`).
- Be runnable with zero external setup (`pnpm --filter rxfy-example-realtime-todos dev`).
- Faithfully implement the **dependency hub** (one topic set per connection, O(C) publish), not
  broadcast-to-all.

## Non-goals

- Cross-tab propagation of **list membership** (new/deleted todos appearing in other tabs
  automatically). That is a query-id-list concern, not an entity-value push; it is handled by
  the acting client locally + `reload()` elsewhere, and explained in the README.
- Authentication, multi-user identity, production deployment concerns, drizzle-kit migration
  tooling (the table is created at boot).

## Decisions (from brainstorming)

| Decision             | Choice                                                                                                                                                                | Why                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database             | SQLite via `better-sqlite3` + `drizzle-orm/better-sqlite3`                                                                                                            | Zero external setup; table created + seeded at boot.                                                                                                   |
| Rendering            | SSR (Vite middleware mode, like `vite-todo`)                                                                                                                          | Demonstrates no-loading-flash first paint feeding into live updates.                                                                                   |
| Process model        | Single Hono Node server, one port, SSR + API + WS                                                                                                                     | User chose single-process.                                                                                                                             |
| Dev server technique | Hono Node server owning the `http.Server`, Vite in middleware mode bridged via `@hono/node-server`'s `getRequestListener`; **not** the `@hono/vite-dev-server` plugin | Owning the Node server is what makes `@hono/node-ws`'s WebSocket upgrade reliable alongside Vite's HMR socket. Same single-process / one-port outcome. |

## Architecture

```
                          one Hono Node server (port 5175)
   browser ──HTTP──▶  Vite middlewares (dev assets/HMR) ─▶ Hono fetch (getRequestListener)
           ──WS────▶  http.Server 'upgrade' ─▶ @hono/node-ws ─▶ /ws route ─▶ dependency hub
                                                                  │
   GET /api/todos ─────────── initial fetch (Drizzle select) ─────┤
   POST /api/todos/:id/toggle ── persist + publish("todo", id) ───┤
   PATCH /api/todos/:id ──────── persist + publish("todo", id) ───┤
   POST /api/todos / DELETE ──── persist (acting-client list ops) ┘
   GET * ─────────────────────── SSR render
```

### Server units

- **`server/db.ts`** — Drizzle schema (`sqliteTable("todos", …)`) over `better-sqlite3`.
  Creates the table (`CREATE TABLE IF NOT EXISTS`) and seeds rows at boot. Exports `db` and
  the `todos` table. Operations use the drizzle query builder (select/insert/update/delete).
  - Interface: `db` (drizzle instance), `todos` (table), `seed()` called on boot.
- **`server/hub.ts`** — the dependency hub from the guide.
  - `deps: Map<WSContext, Set<string>>` (connection → topics, where topic = `"todo:<id>"`).
  - `addClient(ws)`, `removeClient(ws)`, `addDeps(ws, topics)`, `removeDeps(ws, topics)`,
    `publish(name, id, entity)` — O(connections) scan, sends `{ name, entities: [entity] }`.
- **`server/render.ts`** — resolves the SSR `render(url)` function: `vite.ssrLoadModule` in dev,
  the built `dist/server` bundle in prod.
- **`server/index.ts`** — builds the Hono app, registers API + `/ws` + SSR `*` routes, creates
  the Node `http.Server` that runs Vite middlewares first then Hono, calls
  `injectWebSocket(server)`, listens. Reads `NODE_ENV` for dev/prod branch.

### Shared

- **`shared/todo.ts`** — `TodoSchema` (zod: `{ id, title, done }`), `Todo` type. Imported by
  both `createModel` (client) and server validation, so the two can't drift.

### Client units (`src/`)

- **`models.ts`** — `todoModel = createModel(TodoSchema, { getKey, name: "todo" })`,
  `useTodoStore`, `todosState = defineState({ key, params, model, mutations: { addTodo,
removeTodo } })`, and `fetchTodos(params, signal)` hitting `GET /api/todos`.
- **`live/liveClient.ts`** — `createLiveClient(socket)`: ref-counted slices, sends `add`/`remove`
  topic deltas, replays full set on reconnect. Exactly the guide's implementation.
- **`live/useLiveQuery.ts`** — `useLiveQuery(model, ids)`: registers the query's ids as a slice
  via `useLiveClient()`.
- **`live/useLiveEntities.ts`** — `useLiveEntities(model, socket)`: validates pushes with
  `model.schema` and applies `store.setMany`.
- **`live/LiveProvider.tsx`** — owns the socket + client, runs ingest for `todoModel`, exposes
  the client via context (`useLiveClient`).
- **`App.tsx`** — renders the todo list; rows (`TodoItem`) subscribe per entity via
  `useTodoStore().get(id)`. The list component calls `useLiveQuery(todoModel, data.todos)`.
  Toggle/rename POST to the API; add/remove use mutations + persist. Reload button for list
  refresh.
- **`entry-server.tsx`** — `render(url)` returning `{ html, state }` via
  `renderToPipeableStream` + `dehydrate`/`hydrationScript` (mirrors `vite-todo`). Wraps
  `StoreProvider ssr` + `LiveProvider` + `App`.
- **`entry-client.tsx`** — `hydrateRoot` with `StoreProvider ssr` + `LiveProvider` + `App`.
- **`index.html`, `src/index.css`, `src/App.css`** — markup + styling (adapted from `vite-todo`).

> Note: `LiveProvider` opens a real `WebSocket`, which only exists in the browser. On the
> server it must be inert — the provider creates the socket lazily/guarded (`typeof window`),
> and the live hooks no-op when there is no socket. Ingest and subscription only run client-side.

## Data flow (the demo)

1. SSR renders the seeded todos; first paint is fulfilled (no loading flash).
2. Client hydrates, `LiveProvider` opens `ws://…/ws`, `useLiveQuery` subscribes to the fetched
   ids (`add` deltas → server stores them in this connection's dependency set).
3. Tab A toggles todo `u1` → `POST /api/todos/u1/toggle` → server persists → `publish("todo",
"u1", row)` → every connection whose dependency set has `todo:u1` (Tabs A and B) receives
   the push → `store.setMany` writes the cell → every subscriber re-renders. Tabs without `u1`
   get nothing.

## API

| Method + path                | Body        | Effect                                                           |
| ---------------------------- | ----------- | ---------------------------------------------------------------- |
| `GET /api/todos`             | —           | `{ todos: Todo[] }` (initial fetch for `useStateData`)           |
| `POST /api/todos`            | `{ title }` | insert; returns the new `Todo` (acting client adds via mutation) |
| `POST /api/todos/:id/toggle` | —           | flip `done`, persist, `publish`                                  |
| `PATCH /api/todos/:id`       | `{ title }` | rename, persist, `publish`                                       |
| `DELETE /api/todos/:id`      | —           | delete (acting client removes via mutation)                      |
| `GET /ws`                    | —           | WebSocket; `{ type: "add" \| "remove", topics }` messages        |

## Build & run

- `package.json` name `rxfy-example-realtime-todos`, scripts mirroring `vite-todo`:
  `dev` (`tsx server/index.ts`), `build:client`, `build:server`, `preview`, `check-types`,
  `lint`, `clean`.
- New deps beyond `vite-todo`: `hono`, `@hono/node-server`, `@hono/node-ws`,
  `drizzle-orm`, `better-sqlite3` (+ `@types/better-sqlite3`). Drop `express`/`jotai`.
- Wires into the existing pnpm/turbo workspace automatically (`examples/*`).
- tsconfig: `tsconfig.json` references + `tsconfig.app.json` (src + shared) +
  `tsconfig.node.json` (server, vite.config, eslint.config). `eslint.config.ts` from
  `@vanya2h/eslint-config/react`.

## Verification

- `pnpm --filter rxfy-example-realtime-todos check-types` passes.
- `pnpm --filter rxfy-example-realtime-todos lint` passes.
- `pnpm --filter rxfy-example-realtime-todos dev` boots one server; `/` SSRs the todo list.
- Manual: two tabs, toggle/rename in one reflects in the other with no network refetch of the
  list (verify only the `/ws` frame and the toggle POST in the network panel).
- `build` then `preview` serves the production bundle.

## README

`README.md` explains: what the demo shows, how to run it, the dependency-hub design (one set
per connection, targeted push), and the honest boundary (entity-value pushes vs. list
membership; add/remove + `reload()`).
