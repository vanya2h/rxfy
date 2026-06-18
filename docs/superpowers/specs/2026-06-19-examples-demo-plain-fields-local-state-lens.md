# Examples demo: plain fields, local/sync state & Lens — design

**Date:** 2026-06-19
**Packages:** `rxfy-react` (small enhancement), `examples/*` (demo)
**Status:** Approved (design), pending implementation plan

## Goal

Showcase the two new features (plain value fields; local/sync `useStateData({ initial })`) across
**all six** example apps with a small, consistent demo, and make local/sync state directly
**Lens-editable** (boolean → checkbox, enum → select) via a tiny additive library change.

## Part A — Library: lensable `value$` for local/sync state

### Why

`useStateData`'s `data$` is an `Observable`, not an `IAtom`, because remote queries pass through
`IDLE → PENDING → (FULFILLED | REJECTED)` and an atom's `.get()` has no value to return mid-fetch.
In **local/sync** mode the state is always FULFILLED, so exposing a lensable `IAtom` of the value is
clean and unlocks the canonical Lens form pattern (`createLens` + `keyLens` + `useAtom`) directly on
local state fields.

### API

The **local-mode** `StateHandle` gains `value$: IAtom<TQuery>`. Remote mode is unchanged.

```ts
type LocalStateHandle<TShape, TMutations, TQuery, TWritable> =
  StateHandle<TShape, TMutations, TQuery, TWritable> & { value$: IAtom<TQuery> };

// overloads
function useStateData<…>(config: LocalStateConfig<…>): LocalStateHandle<…>;
function useStateData<…>(config: RemoteStateConfig<…>): StateHandle<…>;
```

Usage:

```ts
const { value$, reload } = useStateData({ state: viewOptions, initial: { sort: "newest", compact: false } });
const compact$ = createLens(value$, keyLens("compact")); // IAtom<boolean>
const [compact, setCompact] = useAtom(compact$);          // ← checkbox, two-way
```

### Implementation

In `packages/rxfy-react/src/useStateData.ts`, only in local mode, build `value$` by lensing the
existing wrapped atom (`atom$: Atom<IWrapped<TQuery>>`) through an unwrap lens:

```ts
const value$ = createLens(atom$, {
  get: (w) => (w.type === StatusEnum.FULFILLED ? w.value : (undefined as never)),
  set: (value /*: TQuery */) => createFulfilled(value),
});
```

`createLens` (already imported from `rxfy`) returns an `IAtom<TQuery>`. `value$.get()` reads the
current FULFILLED value (always present in local mode); `value$.set(v)` writes `createFulfilled(v)`
back into the shared atom (no normalization — the query shape is written directly, which is correct
for plain fields; entity slots already hold ids). `keyLens` then focuses any field.

- Add overloads so the local config returns `LocalStateHandle` (with `value$`) and the remote config
  returns the plain `StateHandle`. The implementation returns the union; `value$` is attached only in
  local mode (`isLocal`), `undefined`/absent otherwise.
- Notes: `value$` is keyed to the same atom as `data$`, so writes through `value$` are visible to
  `data$` subscribers and vice-versa. Lensing a **plain** field is the primary use; an entity slot
  exposes its id.

### Tests (`packages/rxfy-react/src/useStateData.local.test.tsx`)

- `value$` is present in local mode and absent (typed) in remote mode.
- `createLens(value$, keyLens("compact"))` round-trips: `useAtom` reads the seeded value; `setCompact`
  updates it and `data$` reflects the change.
- `reload()` resets `value$`/`data$` back to `initial` (existing behavior, re-asserted through `value$`).

### Changeset

`rxfy-react`: **minor** — "local/sync `useStateData` now returns a lensable `value$: IAtom`".

## Part B — Examples demo (all six)

Each example gets the same three small additions (adapted to its domain). Goal is *small and
consistent*, not feature-maximal.

### B1. Mixed `defineState` model — entities + plain zod in ONE model

The example's existing normalized state gains a plain field beside its entity fields, returned by the
fetch and rendered as a caption — demonstrating plain values traveling alongside normalized entities
(and, in SSR examples, dehydrated with the query).

```ts
model: {
  posts: array(PostModel),                                    // entities
  authors: array(UserModel),                                  // entities
  meta: z.object({ total: z.number(), generatedAt: z.string() }), // plain
}
// caption: "12 posts · loaded 14:03"
```

### B2. Local/sync "View options" via `useStateData({ state, initial })`

A plain-field-only state, consumed local/sync (no fetch, sync seed):

```ts
const viewOptionsState = defineState({
  params: z.object({}),
  model: { sort: z.enum([...]), compact: z.boolean() }, // all plain
});
const { value$, reload } = useStateData({ state: viewOptionsState, initial: { sort: "…", compact: false } });
```

Drives the list's client-side sort and a `compact` density CSS class. **Keyless** (private per mount,
SSR-safe — UI prefs are not dehydrated). A "Reset" button calls `reload()`.

### B3. Lens-editable controls (`<ViewOptions>` component)

Each field is bound two-way through Lens on `value$`:

```tsx
const compact$ = useMemo(() => createLens(value$, keyLens("compact")), [value$]);
const sort$ = useMemo(() => createLens(value$, keyLens("sort")), [value$]);
const [compact, setCompact] = useAtom(compact$); // <input type="checkbox">
const [sort, setSort] = useAtom(sort$);          // <select>
```

A single small `ViewOptions` component (per example, co-located) renders a checkbox (boolean) and a
select (enum), plus the Reset button. The list subscribes to `value$` (via `useAtom`/`useObservable`)
to apply sort + density.

### Per-example specifics

| Example | View-options fields (B2/B3) | Mixed-model plain field (B1) |
|---|---|---|
| next-blog | `sort: ["default","alpha"]`, `compact: boolean` | `postsState.meta` → posts caption |
| rr7-blog | same | `postsState.meta` caption |
| waku-blog | same | `postsState.meta` caption (requires `pnpm install` first — deps not installed) |
| vite-todo | `sort: ["created","alpha"]`, `compact` — **local, no refetch** beside the existing fetch-driven filter tabs (the contrast) | `todosState.meta` (total) caption |
| vite-realtime-todos | `sort`, `compact` | `todosState.meta` caption |
| vite-ssr-pagination | `compact`, `showAvatars: boolean` (checkbox via Lens) | — (uses `useStatePagedData`; no plain-model state to extend — contrast is server-paged list vs local options) |

Field names adapt to each example's real schema (e.g. `alpha` sorts by title client-side — no new
entity fields are added). Keep each `ViewOptions` component minimal (~30–50 lines).

## Verification

- `pnpm --filter rxfy-react test` and `pnpm turbo check-types --filter=rxfy --filter=rxfy-react` green.
- For each example: its `build` (or `check-types`) passes. `waku-blog` needs `pnpm install` first; if
  its toolchain can't run in this environment, make the code change and note the example was not built.
- Run at least one example (e.g. `vite-todo`) to confirm the panel toggles work and the list reacts
  without a refetch.

## Out of scope / YAGNI

- No `value$` for remote mode (async contract); no persistence of view options (localStorage); no
  shared/keyed view-options slice (keyless keeps it simple and SSR-safe).
- No new entity fields or schema changes beyond the additive plain `meta` field.

## Affected files

- `packages/rxfy-react/src/useStateData.ts` — `LocalStateHandle`, `value$`, overloads.
- `packages/rxfy-react/src/useStateData.local.test.tsx` — `value$` + Lens tests.
- `.changeset/*` — `rxfy-react` minor.
- `examples/{next-blog,rr7-blog,waku-blog,vite-todo,vite-realtime-todos,vite-ssr-pagination}/**` —
  `ViewOptions` component + wiring; `meta` plain field on the five `defineState` examples.
- Docs: a short note on `value$` in `react/use-state-data.mdx` and the rxfy skill (local-mode handle).
