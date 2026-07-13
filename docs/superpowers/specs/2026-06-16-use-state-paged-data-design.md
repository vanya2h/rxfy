# `useStatePagedData` — reusable pagination / infinite scroll

**Date:** 2026-06-16
**Package:** `rxfy-react`
**Status:** Implemented, then revised — see note below.

> **Superseded design detail (kept as a record).** This spec describes the original API
> (`state` descriptor + `initial` + `merge(prev, page)`). The shipped hook diverged: it takes a
> single `model` (always `array(model)`), `data$` emits a flat `string[]`, the page callback is
> `select(page) => T[]`, and appending is O(page-size) via a new `setRaw` primitive on
> `StateHandle`. The current API lives in the [React Bindings reference](/react#usestatepageddata).

## Problem

The `vite-ssr-pagination` example (`examples/vite-ssr-pagination/src/Users.tsx`) wires
infinite scroll by hand on top of `useStateData`: a `loading` ref to guard concurrent
loads, an `isLoading` state, and a `loadMore(offset)` callback that fetches the next page
and accumulates it with `set(prev => ({ users: [...prev.users, ...page.items] }))`.

Every paged screen reimplements the same boilerplate: cursor computation, concurrency
guard, loading flag, end-of-list detection, and reset-on-reload. This belongs in a
reusable hook.

## Goal

A single hook, `useStatePagedData`, that wraps `useStateData` and owns the pagination
mechanics while staying agnostic about the cursor strategy (offset, page-number, or
opaque token) and the merge strategy (append, prepend, dedup, multi-field).

## API

```ts
function useStatePagedData<TParams, TShape, TPage, TCursor, TMutations>(config: {
  state: StateDescriptor<TParams, TShape, TMutations>;
  params: TParams;
  initial: TShape; // empty seed, e.g. { users: [] }
  fetchPage: (args: { cursor: TCursor; params: TParams; signal: AbortSignal }) => Promise<TPage>;
  getCursor: (args: { ids: QueryShapeOf<TShape>; pageIndex: number }) => TCursor;
  merge: (args: { prev: TShape; page: TPage }) => TShape;
  hasMore?: (args: { page: TPage }) => boolean; // omitted ⇒ infinite
}): StateHandle<TShape, TMutations> & {
  loadMore: () => void;
  isLoading: boolean;
  hasMore: boolean;
};
```

### Design decisions (and why)

- **Single config object.** All inputs — including `state`, `params`, `fetchPage` — are
  named fields of one object. This diverges from the positional style of `useStateData` /
  `useModelStore`, but is intentional for this hook: with seven inputs (several of them
  callbacks), named fields are far more readable than positional args. Callbacks use
  object params for the same reason and for forward-compatibility (new fields can be added
  without breaking call sites).

- **Generic `TCursor`.** The cursor flows `getCursor → fetchPage` with a real type, not
  `unknown`. Offset cursors type as `number`, token cursors as `string`, etc.

- **Pluggable `getCursor`.** Covers offset (`ids.users.length`), page-number
  (`pageIndex * pageSize`), and token cursors in one API. It receives the **normalized id
  shape** (`QueryShapeOf<TShape>`, the same thing `data$` emits) plus the running
  `pageIndex`. This is the cheap shape — no denormalize on the `loadMore` path. The
  trade-off: keyset cursors that need an entity field (e.g. the last item's `createdAt`)
  are **not** supported by `getCursor`; such APIs must encode their cursor from `pageIndex`
  or use the lower-level `useStateData` + manual `set` directly.

- **User-supplied `merge`.** `merge({ prev, page })` operates on the **denormalized**
  `TShape` (entities), exactly like the `set(prev => …)` updater. Fully general: append,
  prepend, dedup, or multi-field pages. Note the asymmetry — `getCursor` sees ids,
  `merge` sees entities; each gets the natural, cheapest shape for its job. This is
  documented at the call site.

- **Optional `hasMore`.** `hasMore({ page })` is evaluated after each fetch (including
  page 0). When it returns `false`, `loadMore` becomes a no-op and the exposed `hasMore`
  flag is `false`. Omitting `hasMore` means the list is infinite (matches today's example).

- **Required `initial` seed.** `fetchPage` returns a page (`TPage`, e.g.
  `{ items, nextCursor }`), not a `TShape`. The first page must be merged into something,
  so the caller provides an empty `TShape` seed (e.g. `{ users: [] }`).

- **Extended `StateHandle` return.** The hook returns the full `StateHandle`
  (`data$`, `set`, `reload`, `mutations`) plus `{ loadMore, isLoading, hasMore }`, so a
  paged screen uses one hook and still renders via `<Pending value$={data$}>` and keeps
  mutations/reload.

## Mechanics

The hook **composes `useStateData`** rather than reimplementing the query lifecycle.

### Page 0 (the SSR'd / hydrated first page)

A single `fetchPage` handles every page, including the first. The hook synthesizes the
`fetchFn` it passes to `useStateData`:

```ts
const emptyIds = normalizeResult(registry, state.fields, initial); // QueryShapeOf<TShape> with empty arrays
const fetchFirst = (params, signal) =>
  fetchPage({ cursor: getCursor({ ids: emptyIds, pageIndex: 0 }), params, signal }).then((page) =>
    merge({ prev: initial, page }),
  );
```

Because `fetchFirst` returns a `TShape`, **SSR, query caching, dedup, and hydration work
unchanged** — page 0 is server-rendered and hydrated exactly as a plain `useStateData`
fetch. `getCursor`/`merge`/`hasMore` are stable per render via the config; `fetchFirst` is
memoized so `useStateData`'s `params`-identity refetch semantics are preserved.

The hook obtains `registry` from `useModelRegistry()` and uses `normalizeResult` /
`state.fields` the same way `useStateData` does internally.

### `loadMore`

1. Concurrency guard: if a load is in flight (`loading` ref), return. Also return if
   `hasMore` is `false`.
2. Set `isLoading = true`, mark the loading ref.
3. Read the latest `QueryShapeOf<TShape>` (the current ids) — captured from a subscription
   to `data$` (a ref holding the latest emission).
4. `const cursor = getCursor({ ids, pageIndex })`.
5. `const page = await fetchPage({ cursor, params, signal })`.
6. `handle.set((prev) => merge({ prev, page }))`.
7. Increment `pageIndex`; recompute `hasMore` from `hasMore?.({ page }) ?? true`.
8. In `finally`: clear `isLoading` and the loading ref.

`pageIndex` starts at `1` after page 0 (page 0 is fetched by `useStateData`). For
offset-based `getCursor` the index is informational; for page-number APIs it is the cursor
source.

### `reload`

Wrap `handle.reload` so it resets pagination state: `pageIndex → 0`, `hasMore → true`,
`isLoading → false`, loading ref cleared. After reload, `useStateData` refetches page 0
through `fetchFirst`.

## Footprint

- **New file:** `packages/rxfy-react/src/useStatePagedData.ts`.
- **Export:** add to `packages/rxfy-react/src/index.tsx` (type + hook).
- **Example refactor:** `examples/vite-ssr-pagination/src/Users.tsx` adopts the hook,
  dropping the manual `loading` ref, `isLoading` state, and `loadMore` callback. The
  `LoadMoreSentinel` and mode toggle stay; `onVisible={() => loadMore()}` (no offset arg).
- **Changeset:** `minor` for `rxfy-react` (new public export).

### Example call site (target)

```ts
const { data$, loadMore, isLoading } = useStatePagedData({
  state: usersState,
  params,
  initial: { users: [] },
  fetchPage: ({ cursor }) => fetchUsers(cursor === 0 ? null : String(cursor)),
  getCursor: ({ ids }) => ids.users.length,
  merge: ({ prev, page }) => ({ users: [...prev.users, ...page.items] }),
});
```

## Testing (Vitest, react)

- **Page accumulation:** initial page renders; `loadMore()` appends the next page; ids
  grow and entities resolve through the model store.
- **Concurrency guard:** two rapid `loadMore()` calls issue only one fetch.
- **`hasMore` termination:** when `hasMore` returns `false`, the flag flips and a
  subsequent `loadMore()` issues no fetch.
- **`reload` reset:** after `reload()`, `pageIndex` is back to 0 and page 0 is refetched.
- **Cursor passing:** `getCursor` receives the current ids and correct `pageIndex`; the
  computed cursor reaches `fetchPage`.
- **SSR unchanged:** page 0 still resolves through the `useStateData` suspense/cache path
  (reuse the existing server-render test harness).

## Out of scope

- Keyset/opaque-token cursors that require entity fields in `getCursor` (documented
  limitation — use `useStateData` + manual `set`).
- Bidirectional paging (load-previous) and windowing/virtualization.
- A built-in intersection-observer sentinel component (the example keeps its own
  `LoadMoreSentinel`).
