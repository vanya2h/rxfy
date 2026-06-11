# SSR Support for rxfy — Design

**Date:** 2026-06-11
**Status:** Approved
**Scope:** `packages/rxfy`, `packages/rxfy-react`, `examples/vite-todo` migration
**Out of scope:** `examples/next-blog` (follow-up spec)

## Motivation

rxfy currently has no SSR story. `usePending` always starts at `"pending"`, so server-rendered
HTML shows loading states; `StoreProvider` creates an empty registry with no way to seed it; and
server-fetched data has no path to the client, so every page double-fetches and flashes a loader.

Goal: **first-class SSR**. The server fetches all data on demand (driven by what the component
tree renders — no manual prefetch calls), captures each query as fulfilled or rejected, serializes
that into the HTML, and the client rehydrates so the first paint is already fulfilled — no loading
flash, no re-fetch, no hydration mismatch.

## Design summary

- A **query cache** lives inside the model registry, keyed by state key + params.
- On the server, `useStateData` **suspends** (throws the fetch promise) on a cache miss; React
  re-renders the boundary when data settles. No `prefetch` API exists or is needed.
- `dehydrate(registry)` serializes the query cache (ids) and the model stores (entities) to JSON;
  the client rehydrates both, and `useStateData` cache hits emit synchronously.
- `data$` becomes **normalized**: it emits entity *ids* only. Entity data is readable exclusively
  through model stores. This is a breaking change and the core consistency guarantee.
- Mutations and `set()` keep accepting **full entities** (the v0.2 mental model): the hook
  denormalizes current ids into entities (via the model stores' sync value maps), runs the
  reducer on the fetch shape, then normalizes the result back.
- Public API signatures are otherwise unchanged: `useStateData(state, fetchFn, params)` keeps its
  shape; `fetchFn` stays at the call site.

## Architecture

### Two layers, two questions

| Layer | Holds | Answers | Updated by |
|---|---|---|---|
| Query state (`data$`) | entity **ids** (membership, order, shape) | "which entities are in this view" | fetch settle, mutations, `set()`, `reload()` |
| Model stores | entity **values** | "what is this entity right now" | `normalize()` on fetch settle / mutation / `set()`, hydration ingest, direct `store.set()` (e.g., websocket events) |

Components render `ids.map(id => <Item id={id} />)`; each item subscribes to its model store.
Because `data$` carries no entity fields, reading stale entity data off a query snapshot is
**unrepresentable** — the mistake cannot be made.

Known limit (documented): membership changes arriving via websocket need a query-level write
(`set()` / mutation / `reload()`); entity-level `store.set()` cannot alter list membership.

### Normalized shapes

`defineState`'s `model` declaration derives **two** shapes:

- **Fetch shape** — what `fetchFn` returns and what mutations / `set()` operate on: full
  entities. `array(model)` → `T[]`; single `model` field → `T`.
- **Query shape** — what `data$` emits and what the cache stores: ids.
  `array(model)` → `string[]`; single field → `string`.

```ts
const todosState = defineState({
  key: "todos", // NEW — stable string identity, required for SSR caching
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(todoModel) },
  mutations: {
    // reducers see full entities — unchanged from v0.2
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
    removeTodo: (prev, id: string) => ({ ...prev, todos: prev.todos.filter((t) => t.id !== id) }),
  },
});
```

On fetch settle, `normalize()` splits the fetch result: entities → model stores, ids → query
state/cache.

Mutations and `set()` bridge the two shapes via **denormalize → reduce → normalize**:

1. The hook denormalizes the current query state: ids → entities, read synchronously from the
   model stores' sync value maps.
2. The reducer runs on the fetch shape — so it always sees the freshest entity values,
   including ones written by websocket events.
3. The result is normalized: entities → model stores, ids → query state + cache write-through.

This replaces today's manual two-step (`store.set(todo.id, todo)` then `mutations.addTodo(…)`)
with a single call that cannot be half-done. Cost per mutation is one denormalize + normalize
pass — O(list size), negligible.

Edge case: an id in query state with no entity in the store should be impossible (every path that
writes ids writes entities first). If it happens anyway, the denormalizer throws a dev-readable
error rather than passing `undefined` into a reducer.

### Query cache

Lives inside the registry (`createModelRegistry()`), alongside the model stores.

- **Key:** `` `${state.key}:${stableStringify(params)}` `` — `stableStringify` sorts object keys
  so server and client produce identical keys.
- **Entry:** `{ status: "fulfilled", value /* query shape: ids */ } | { status: "rejected", error }`,
  plus a non-serialized in-flight promise slot (used for Suspense and request deduplication).
- States without a `key` never touch the cache; every code path falls through to current
  (pre-SSR) behavior.

### Consistency rule: normalize on write, never on read

`normalize()` runs only when denormalized data **enters** the system:

1. server fetch settle (before React re-renders the suspended boundary — so model-store
   subscriptions are live during SSR),
2. client fetch settle,
3. mutation / `set()` results (after the denormalize → reduce step described above).

Hydration ingest needs no normalization: the dehydrated payload is already normalized — `models`
entries write directly into model stores, `queries` entries directly into the cache.

A cache **hit** (e.g., remounting a page on client-side back-navigation) returns ids only and
never touches model stores. Consequence: a fresher value written by a websocket event can never
be clobbered by navigation. Model stores are strictly last-write-wins on real events.

Staleness policy: the server snapshot wins on mount; mutations write through to the cache (so
remounts see mutated data); `reload()` is the explicit refresh path (deletes the entry,
re-fetches client-side, writes the result back).

### Dehydration / hydration

Each layer serializes exactly what it holds — nothing is serialized twice:

```ts
type DehydratedState = {
  queries: { [cacheKey: string]: { status: "fulfilled"; value: unknown } | { status: "rejected"; error: { name: string; message: string } } };
  models: { [modelName: string]: { [entityKey: string]: unknown } };
};
```

- `dehydrate(registry): DehydratedState` — exported from `rxfy`.
- Hydration ingest (a *write*): `models` entries → `store.set()` per entity; `queries` entries →
  query cache.
- Because model stores dehydrate wholesale, entities written server-side via direct `store.set()`
  outside any fetch (e.g., seeded data) survive to the client.

Two small core changes enable this:

1. **`createModel(schema, { getKey, name })`** — optional stable string `name`. Symbols
   (`_key`) cannot cross the server/client boundary. A model without a `name` opts out of
   dehydration; touching it during an `ssr` render logs a dev warning.
2. **Model stores track a sync value map** — stores are `ReplaySubject(1)`-based and cannot be
   read synchronously, so each store also maintains a `Map<string, T>` of latest values
   (updated in `set` / `setMany`) that `dehydrate` reads.

## `useStateData` decision table

Signature unchanged: `useStateData(state, fetchFn, params)`. `fetchFn` runs on the server during
SSR and on the client for misses/reloads — consumers must write it to work in both environments.

| Environment | Cache state | Behavior |
|---|---|---|
| Server, `ssr: false` (default) | — | Current behavior: `data$` pending. Backward compatible. |
| Server, `ssr: true` | Miss | Call `fetchFn`, store in-flight promise in cache, **throw promise** (Suspense). |
| Server, `ssr: true` | In-flight | Throw the same promise — request deduplication across components. |
| Server, `ssr: true` | Hit | `data$` emits cached ids synchronously; rejected entry → `data$` errors synchronously. |
| Client | Hit | Synchronous emission; no fetch. (Model stores were already filled at hydration ingest.) |
| Client | Miss | Current behavior: fetch with AbortSignal. |
| Client, `reload()` | Any | Delete entry → fetch → write result back to cache (+ normalize). |
| Client, mutation / `set()` | Any | Denormalize → reduce → normalize; update subject **and** write ids through to cache entry. |

Non-goal (documented): two components mounted with the same `(state, params)` still have separate
subjects; they share initial values via the cache but do not share live mutation streams.

## `usePending` hydration-correctness fix

Today the hook starts at `"pending"` and picks values up only after `useSyncExternalStore`
subscribes (post-render). With a hydrated cache, `data$` emits synchronously — but the first
client render would still show `"pending"`, mismatching server HTML and causing a hydration error
plus a flash.

Fix: `usePending` performs a synchronous probe on first render — subscribe-and-capture inside the
initial-state computation. If the source emits synchronously, the initial status is `fulfilled`
(or `rejected`). Async sources behave exactly as today. This covers both `data$` cache hits and
seeded model-store subscriptions, making server HTML and first client paint byte-identical.

## React integration surface (`rxfy-react`)

- **`StoreProvider`** gains:
  - `ssr?: boolean` (default `false`) — enables the server-side suspend behavior.
  - `dehydratedState?: DehydratedState` — prop-based hydration for non-streaming setups.
  - On the client it also ingests the `window.__RXFY_SSR__` push protocol (below), including
    entries that arrive after hydration starts (late-streamed Suspense boundaries).
- **`collectStateData(registry, render)`** — two-pass helper for strict `renderToString`
  environments (the Apollo `getDataFromTree` pattern): render → await in-flight promises
  collected in the registry → render again (cache hits) → repeat until nothing suspends.
- **`rxfy-react/next` subpath export** — `<HydrationStream />`: uses Next's
  `useServerInsertedHTML` to flush newly settled cache entries and newly written model entries
  per stream flush as `<script>window.__RXFY_SSR__.push(…)</script>` tags. `next` is an optional
  peer dependency; the subpath keeps it out of the main bundle. Unit-tested in this project;
  end-to-end validation lands with the next-blog example.

### Supported SSR modes

| Mode | Renderer | How data gets to HTML |
|---|---|---|
| Streaming (Next.js App Router) | `renderToPipeableStream` (streamed) | `<HydrationStream />` script-tag deltas per flush |
| Buffered (plain Express, vite-todo) | `renderToPipeableStream` + `onAllReady` | one `dehydrate(registry)` → single inline `<script>` |
| Two-pass | `renderToString` via `collectStateData` | same single inline `<script>` |

Single-pass `renderToString` without the helper cannot wait for data (a React limitation);
suspended boundaries render fallbacks — same as today, documented.

## Error handling

- Rejected entries serialize as `{ name, message }` (stack stripped); rehydrated as a real
  `Error`. `<Pending rejected>` renders the server-side failure with a working `onReload` that
  retries client-side.
- All JSON embedded in HTML escapes `<` as `\u003c` (XSS hardening).
- Dev warnings: keyless state or nameless model touched during an `ssr: true` render.
- Query values must be JSON-serializable (already implied by zod-modeled data).

## Breaking change & migration

`data$` carries **ids instead of entities**. Mutation reducers and `set()` are unchanged — they
keep operating on full entities, so the break is limited to `data$` consumers. Pre-1.0; shipped
as a minor bump 0.2.x → **0.3.0** for `rxfy` + `rxfy-react` with one changeset noting the break.

`examples/vite-todo` is migrated in the same change:

- `App.tsx` reads ids from `data$` (the list already renders `<TodoItem id>` by id) and drops the
  manual `store.set` + mutation two-step in `handleAdd` — the example gets simpler.
- The Express server upgrades from `renderToString` to buffered `renderToPipeableStream` +
  `onAllReady` + `dehydrate`, making vite-todo the working SSR demo until next-blog lands.

## Test plan

- **`rxfy` core:** query cache (key stability via sorted-key stringify; fulfilled / rejected /
  in-flight transitions), dehydrate → hydrate round-trip for queries and models, model-store sync
  value map, dev warnings for unnamed model / keyless state in ssr mode.
- **`rxfy-react`:** `usePending` sync-probe (synchronous source → first render fulfilled; async
  source unchanged); `useStateData` full decision table — server suspend on miss, promise dedup,
  hydrated hit → no fetch (stores filled at ingest), remount hit → model stores untouched, `reload()`
  invalidation, mutation denormalize → reduce → normalize round-trip (reducer sees freshest store
  values; missing-entity id throws a dev-readable error); rejected entry → `rejected` render with
  working retry.
- **SSR integration (vitest, node env):** buffered `renderToPipeableStream` / `onAllReady`
  round-trip and `collectStateData` two-pass round-trip — render, dehydrate, hydrate into a fresh
  registry, assert identical markup and zero client fetches. `<HydrationStream />` unit tests
  (script-tag payloads, push-protocol ingest).
- **vite-todo:** stays wired into turbo `build` / `check-types` / `lint`.

## Follow-up (separate spec)

`examples/next-blog` — Next.js App Router blog (posts, comments, users) exercising streaming
hydration, parallel Suspense fetches, membership mutations, live `store.set()` updates, and
rejected-state hydration end-to-end.
