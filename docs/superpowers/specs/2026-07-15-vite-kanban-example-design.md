# vite-kanban — full-SSR live kanban example

**Date:** 2026-07-15
**Package:** `examples/vite-kanban` (private, `"private": true`, never published)

## Goal

Add a new example, `vite-kanban`: a single kanban board that server-renders fully
(works with JavaScript disabled) and is live across tabs via the rxfy sync layer.
Dragging, reordering, or editing a card in one tab appears instantly in every other
open tab with no refetch; creating or deleting a card refetches the id-list on demand.

It is the first example whose live-sync story centers on **in-place `patch`** (drag =
moving an entity between derived buckets), making it a clean teaching companion to the
blog examples (whose story centers on lists going `stale`).

## Reference

Model the whole app on `examples/vite-blog-framework` — the flagship Vite SSR + Hono +
PGlite/drizzle + rxfy-sync example. Reuse its wiring shape verbatim where possible
(server split, entry-server/client, api-client, sync/ws modules, smoke tests).

## Stack

- Vite 6 SSR (buffered `onAllReady` streaming — full markup without JS, like the blog).
- Hono + `@hono/node-server` + `@hono/node-ws` (WebSocket sync transport via `rxfy-ws`).
- PGlite (`@electric-sql/pglite`) + `drizzle-orm`, storage via `rxfy-server-drizzle`.
- `rxfy`, `rxfy-react`, `rxfy-server`, `rxfy-ws`, `rxfy-client`.
- Tailwind v4 + shadcn primitives. Reuse generic UI (`button`, `card`, `input`,
  `textarea`) from `examples-shared/ui`; keep all kanban-domain code local to the example.
- `@dnd-kit/core` + `@dnd-kit/sortable` for drag/reorder; `fractional-indexing` for order keys.

## Domain — one entity, fixed columns

Columns are **constants**, not entities:

```ts
const COLUMNS = [
  { id: "todo", title: "To Do" },
  { id: "doing", title: "Doing" },
  { id: "done", title: "Done" },
] as const;
type ColumnId = (typeof COLUMNS)[number]["id"];
```

The single synced entity is **Card** (minimal):

```ts
card = {
  id: string,
  columnId: ColumnId,
  title: string,
  description: string, // may be empty
  position: string, // fractional-index key (LexoRank-style)
  createdAt: string, // ISO
};
```

A card's place on the board is `(columnId, position)`. `position` is a
`fractional-indexing` string so a card can be inserted between any two neighbors, and
concurrent live moves from different tabs reconcile without collisions or renumbering.

## State shape

One state:

```ts
boardState = defineState({
  key: "board",
  params: z.object({}), // single board, no params
  model: { cards: array(cardModel) },
});
```

- `data$` from `useStateData` emits the **query shape** — `cards` is an array of **card
  ids across the whole board** (all three columns), not entities (invariant 1).
- Each column's ordered list is **derived client-side**: read every card via
  `useModelStore(cardModel).get(id)`, filter by `columnId`, sort by `position`.
- Entities are always read from the store, never off the query.

## Live-sync semantics (the point of the example — invariant 2: patch vs stale)

| Action                      | Server call                                                            | Frame     | Effect on other tabs                                                                                                    |
| --------------------------- | ---------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| Drag card to another column | `sync.update(cardResource, id, { columnId, position })`                | **patch** | Card re-renders in its new column instantly, **no refetch** — the board id-list is unchanged; only entity fields moved. |
| Reorder within a column     | `sync.update(cardResource, id, { position })`                          | **patch** | Same — pure in-place field change.                                                                                      |
| Edit title/description      | `sync.update(cardResource, id, { title?, description? })`              | **patch** | Card text updates in place.                                                                                             |
| Create card                 | `sync.create(cardResource, {...}, { touch: [touch(boardState, {})] })` | **stale** | `updatesAvailable$` bumps → client `applyUpdates()` refetches the id-list.                                              |
| Delete card                 | `sync.delete(cardResource, id, { touch: [touch(boardState, {})] })`    | **stale** | Same — id-list shrinks.                                                                                                 |

The key insight the example demonstrates: **column membership is derived from an entity
field**, so moving a card is a `patch`, not a list mutation. Board id-list changes
(create/delete) are the only `stale` events.

### Drag → position computation

dnd-kit `onDragEnd` yields the source card and the drop target (column + index among that
column's sorted cards). Compute `position = generateKeyBetween(prevKey, nextKey)` from the
neighbors at the drop index (`fractional-indexing`), then:

1. Optimistic local `store.set(cardModel, { ...card, columnId, position })` for a snappy drag.
2. `api.cards[":id"].$patch({ param: { id }, json: { columnId, position } })`.
3. The server echoes a `patch` frame; the store converges (idempotent).

## File layout (parallels vite-blog-framework)

```
examples/vite-kanban/
  index.html
  vite.config.ts
  vitest.config.ts
  package.json                 # private, name "vite-kanban"
  tsconfig.json tsconfig.app.json tsconfig.node.json
  eslint.config.ts
  components.json              # shadcn config (matches blog)
  README.md
  public/favicon.svg
  src/
    db/schema.ts               # cards pgTable
    kanban/
      models.ts                # cardModel (createModel + zod schema, getKey)
      states.ts                # boardState, COLUMNS, ColumnId, input schemas
      resources.ts             # cardResource (defineResource) + createResourceRegistry
      api-client.tsx           # typed hono RPC client + ApiProvider/useApi (SSR + browser)
      seed.ts                  # seed cards spread across the three columns
      Board.tsx                # DndContext; renders 3 Columns; onDragEnd handler
      Column.tsx               # SortableContext; derives + sorts its cards; NewCardForm
      Card.tsx                 # useSortable draggable card; inline edit + delete
      CardEditor.tsx           # title/description edit form (used by Card)
      NewCardForm.tsx          # add card to a column
    App.tsx                    # StoreProvider + ApiProvider + Board; ThemeToggle
    entry-server.tsx           # render(url, apiFetch, opts): fetch board, dehydrate, stream
    entry-client.tsx           # hydrate, wire syncClient over WS, renew loop
    styles.css
    vite-env.d.ts
  server/
    index.ts                   # Hono app: /api routes, WS upgrade, Vite middleware, SSR
    api.ts                     # GET /board, POST /live/renew, POST/PATCH/DELETE /cards
    sync.ts                    # createSync({ storage: drizzleStorage(db), hub, secret })
    ws.ts                      # createWsServer wired to the single hub
    db.ts                      # PGlite + drizzle + migrate + seed
    render.ts render-types.ts  # SSR render helper (mirrors blog)
    ssr.smoke.test.ts          # renders board HTML with 3 columns + seeded cards
    sync.smoke.test.ts         # sync.update(card) broadcasts a patch frame on the hub
```

## SSR flow (identical to the blog)

1. `server/index.ts` GET `*` calls `render(url, api.request, opts)`.
2. `entry-server` fetches `GET /board`; `api.ts` returns `sync.serve(boardState, {}, data)`
   — rows parsed through the state schema + a signed `$grant` attached.
3. React renders the board to a buffered `onAllReady` stream; rxfy `dehydrate` writes the
   snapshot script (query id-list + card entities + grant) after the app markup.
4. Client `entry-client` `hydrate()`s, lifts the `$grant`, and subscribes over its own
   WebSocket (`ws.ts`); `createSyncClient` applies `patch`/`stale` frames. Grants nearing
   expiry are renewed via `POST /live/renew`.
5. HMAC secret shared between HTTP (`sync.ts`) and WS server via `RXFY_SECRET`
   (dev default `"dev-secret-change-me"`).

Fully functional with JavaScript disabled: buffered streaming emits complete markup; live
updates and drag layer on once JS loads.

## Testing

Two in-package Vitest smoke tests (no e2e target this iteration):

- `ssr.smoke.test.ts` — server-render the board and assert the HTML contains the three
  column titles and the seeded card titles, and includes a hydration snapshot script.
- `sync.smoke.test.ts` — perform `sync.update` on a seeded card's `columnId`/`position`
  and assert a `patch` frame is published on the hub for the board channel.

(An `examples/e2e` `sync-kanban` two-tab target is explicitly deferred to a follow-up.)

## Monorepo integration

- `package.json` scripts match the blog: `dev`, `build:client`, `build:server`,
  `preview`, `test`, `lint`, `check-types`, `clean`.
- Turbo picks it up automatically (workspace glob `examples/*`).
- Dev port: pick an unused one (blog framework runs on its own; use e.g. **5177**).
- No changeset required — examples are private and unpublished.

## Non-goals (YAGNI)

- Multiple boards, editable/CRUD columns, board routing.
- Card labels, assignees, due dates, comments.
- Reorder of columns; column constants are fixed.
- e2e Playwright coverage (deferred).
- Auth / multi-user identity beyond the anonymous shared board.
