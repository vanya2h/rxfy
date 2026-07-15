# vite-kanban

A live kanban board that demonstrates the rxfy live framework (`rxfy-server` + `rxfy-ws` + the React sync client from `rxfy-react`), built the idiomatic way: **the query holds the board's structure as ids; each card component unwraps its own entity from the normalized store.** The board server-renders fully (works with JavaScript disabled) and stays live across every connected tab.

The board is a single page with three fixed columns (**To Do / Doing / Done**). A card's place is `(columnId, position)`, where `position` is a [`fractional-indexing`](https://github.com/rocicorp/fractional-indexing) key — so a card can be dropped between any two neighbors, and orderings stay stable without renumbering.

## The point of this example — structure in the query, entities in the store

The board state is **three ordered id arrays** — `{ todo, doing, done }` — one per column, each sorted by `position` on the server. Components never re-derive column membership from entity fields; they read structure from the query and unwrap each card by id:

```tsx
// Board: the query gives ordered ids per column
{({ todo, doing, done }) => COLUMNS.map((c) => <Column ids={groups[c.id]} … />)}

// Card: unwrap this id's entity from the normalized store
const [card] = useAtom(useModelStore(cardModel).get(id));
```

This shapes the live-sync story cleanly around **structure vs fields**:

- **Move a card, reorder within a column, create, or delete** → the board's _structure_ (which ids sit in which column, in what order) changes → the server emits a **`stale`** on the `board` channel → subscribed tabs refetch via `applyUpdates()`. `data$` doesn't re-emit during the refetch, so the board holds its last render (stale-while-revalidate) — no "Loading" flash. Drags are optimistic locally (`setRaw` reorders the id arrays instantly), and the refetch reconciles.
- **Edit a card's title or description** → no structural change → the server emits an in-place **`patch`** on the entity topic (`card:<id>`) → the one card re-renders on every tab **with no refetch**.

The blog examples show the same `patch`/`stale` split from the list side; here it falls out of a grouped-id board with per-card unwrapping.

## Stack

- **Vite SSR** — isomorphic rendering with Hono as the request handler (buffered `onAllReady` streaming → full markup without JS)
- **Hono** + **`@hono/node-ws`** — HTTP API + WebSocket transport for sync messages
- **PGlite** — in-memory Postgres (no external DB needed; resets on restart)
- **Drizzle ORM** — type-safe schema + queries
- **rxfy-server** — `defineResource` / `createSync` / `sync.serve` / `sync.hydration` / `touch`
- **rxfy-ws** — WebSocket protocol layer (server-side `createWsServer`)
- **rxfy-react** — `useStateData`, `useModelStore`, `useAtom`, `usePending`, sync client, `StoreProvider`
- **@dnd-kit** + **fractional-indexing** — drag/reorder with collision-free ordering keys
- **shadcn/ui** (Tailwind v4) — `Card`/`Button`/`Input`/`Textarea` components and a light/dark toggle

## Run

```
pnpm --filter vite-kanban dev
```

Open http://localhost:5188. The in-memory database resets each time the server restarts.

For a production build + preview:

```
pnpm --filter vite-kanban build
pnpm --filter vite-kanban preview
```

Set `RXFY_SECRET` in production so the HTTP server (which signs channel grants) and the WebSocket server (which verifies them) share the same HMAC secret. In development both fall back to `dev-secret-change-me`.

## Two-tab demo script

1. Open two browser tabs at `/`.
2. In **tab A**, drag a card from **To Do** into **Doing**. **Tab B** shows the card move into Doing live (a quick refetch — no visible flash).
3. Reorder two cards within a column in tab A. Tab B reflects the new order live.
4. Click a card's pencil, edit its title, and save. Both tabs update the title **in place** (an entity `patch`, no refetch).
5. Add a card with a column's "Add a card…" form. It appears live in the other tab.
6. Delete a card. It disappears live in the other tab.

## How it works

`defineResource` derives an rxfy model and Drizzle table operations from the schema in one call. `createSync` wraps `create` / `update` / `delete` so every write also broadcasts over the hub. `GET /api/board` groups the rows into three position-ordered id arrays and hands them to `sync.serve`. Writes decide `patch` vs `stale`:

- **`sync.update`** always publishes a `patch` on the entity topic (`card:<id>`). A **title/description edit** is only that — an in-place patch.
- A **move/reorder** additionally calls `sync.touch(touch(boardState, {}))`, and **create/delete** pass `touch: [touch(boardState, {})]` — both publish a `stale` on the `board` channel, because they change which ids the query holds.

`rxfy-ws` carries those messages over a single WebSocket. On the client, `createSyncClient` applies `patch` messages straight to the shared model store (so an edited card re-renders wherever it's used) and increments a per-channel counter for `stale` messages, which `useStateData().updatesAvailable$` exposes; `App` auto-applies it so the board stays live.

Each read is stateless: `sync.serve` signs a **channel grant** (a short-lived HMAC-signed token scoped to the state it served) and returns it as `$grant`; the client lifts the grant, subscribes over the single WebSocket, and posts grants nearing expiry to `POST /api/live/renew`. The WebSocket server verifies each grant against the same secret the HTTP server signs with — no server-side session state.

Dragging is finalized in dnd-kit's `onDragEnd`: the drop target resolves to a column and index, a new fractional `position` is computed between the drop neighbors, the id arrays are reordered optimistically with `setRaw`, and a `PATCH /api/cards/:id` persists it — the server's `stale` then reconciles every tab.

## Notes

This is a private example package (not published to npm). It is intended as a reference implementation only.
