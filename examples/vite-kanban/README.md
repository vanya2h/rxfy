# vite-kanban

A live kanban board that demonstrates the rxfy live framework (`rxfy-server` + `rxfy-ws` + the React sync client from `rxfy-react`). Cards **move**, **reorder**, and **edit** live in place across every connected tab — no page reload, no badge. Card **creates** and **deletes** surface a "N new · refresh" affordance via `useStateData().updatesAvailable$`. The board server-renders fully and works with JavaScript disabled.

The board is a single page with three fixed columns (**To Do / Doing / Done**). A card's place on the board is `(columnId, position)`, where `position` is a [`fractional-indexing`](https://github.com/rocicorp/fractional-indexing) key — so a card can be dropped between any two neighbors and concurrent live moves from different tabs reconcile without renumbering.

## The point of this example — `patch` vs `stale`

Column membership is **derived from an entity field** (`columnId`), not from a list. So:

- **Drag a card across/within a column, or edit its title/description** → `sync.update` → a `patch` message. Only entity fields change; the board's id-list is unchanged, so the card re-renders in its new column on every tab **with no refetch**.
- **Create or delete a card** → `sync.create` / `sync.delete` with `touch(boardState, {})` → a `stale` message. The id-list changed, so subscribed tabs bump `updatesAvailable$` and refetch the ids via `applyUpdates()`.

This is the mirror image of the `vite-blog` example, whose live story centers on lists going `stale`; here the star is the in-place `patch`.

## Stack

- **Vite SSR** — isomorphic rendering with Hono as the request handler (buffered `onAllReady` streaming → full markup without JS)
- **Hono** + **`@hono/node-ws`** — HTTP API + WebSocket transport for sync messages
- **PGlite** — in-memory Postgres (no external DB needed; resets on restart)
- **Drizzle ORM** — type-safe schema + queries
- **rxfy-server** — `defineResource` / `createSync` / `sync.serve` / `sync.hydration` / `touch`
- **rxfy-ws** — WebSocket protocol layer (server-side `createWsServer`)
- **rxfy-react** — `useStateData`, `useModelStore`, sync client, `StoreProvider`
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
2. In **tab A**, drag a card from **To Do** into **Doing**. **Tab B** shows the card move into Doing live — no badge, no refresh.
3. Reorder two cards within a column in tab A. Tab B reflects the new order live.
4. Click a card's pencil, edit its title, and save. Both tabs update the title in place.
5. Add a card with a column's "Add a card…" form. The other tab shows a refresh affordance (the id-list changed → `stale`); refreshing loads the new card.
6. Delete a card. The other tab surfaces the same refresh affordance.

## How it works

`defineResource` derives an rxfy model and Drizzle table operations from the schema in one call. `createSync` wraps `create` / `update` / `delete` so every write also broadcasts over the hub: an **update** publishes a `patch` message on the entity's topic (`card:<id>`); a **create** or **delete** publishes a `stale` message on the state channel named in the `touch(...)` call (`board`). `rxfy-ws` carries those messages over a single WebSocket connection. On the client, `createSyncClient` applies `patch` messages directly to the shared model store — so the moved/edited card re-renders everywhere it is used — and increments a per-channel stale counter for `stale` messages, which is what `updatesAvailable$` exposes.

Each read is stateless: `sync.serve` signs a **channel grant** (a short-lived HMAC-signed token scoped to the state it served) and returns it as `$grant`; the client lifts the grant, subscribes over the single WebSocket, and posts grants nearing expiry to `POST /api/live/renew`. The WebSocket server verifies each grant against the same secret the HTTP server signs with, so it pushes updates for exactly the topics the grant authorizes — no server-side session state.

Dragging is finalized in dnd-kit's `onDragEnd`: the drop target resolves to a column and index, a new fractional `position` is computed between the drop neighbors, the card cell is optimistically updated in the store, and a `PATCH /api/cards/:id` persists it — the server then echoes an idempotent `patch` that confirms the move on every tab.

## Notes

This is a private example package (not published to npm). It is intended as a reference implementation only.
