# Examples demo: plain fields, local/sync state & Lens — design

**Date:** 2026-06-19
**Packages:** `rxfy-react` (small enhancement), `examples/*` (demo)
**Status:** Approved (design), pending implementation plan

## Goal

Showcase the two new features (plain value fields; local/sync `useStateData({ initial })`) across
**all six** example apps with a small, consistent demo, and make local/sync state directly
**Lens-editable** (boolean → checkbox, enum → select) via a tiny additive library change.

## Part A — Library: an additive `atom$` on the handle (per-mode type)

### Why

`useStateData`'s `data$` is an `Observable`, not an `IAtom`, because remote queries pass through
`IDLE → PENDING → (FULFILLED | REJECTED)` and an atom's `.get()` has no value to return mid-fetch.
Exposing the underlying **`atom$`** as an additive field — typed per mode — keeps all async
information *and* unlocks the canonical Lens form pattern (`createLens` + `keyLens` + `useAtom`)
directly on local/sync state fields.

### API

The base `StateHandle` is **unchanged** (no `atom$` — existing consumers are unaffected). Two derived
handles add `atom$` with a mode-appropriate type, selected by overloads keyed off the existing
discriminated config union:

```ts
// async/remote mode — full status wrapper (sound during IDLE/PENDING/REJECTED)
type RemoteStateHandle<TShape, TMutations, TQuery, TWritable> =
  StateHandle<TShape, TMutations, TQuery, TWritable> & { atom$: IAtom<IWrapped<TQuery>> };

// local/sync mode — unwrapped value (always FULFILLED ⇒ sound), directly lensable
type LocalStateHandle<TShape, TMutations, TQuery, TWritable> =
  StateHandle<TShape, TMutations, TQuery, TWritable> & { atom$: IAtom<TQuery> };

// overloads — the right handle (and atom$ type) falls out per call site:
function useStateData<…>(config: RemoteStateConfig<…>): RemoteStateHandle<…>;
function useStateData<…>(config: LocalStateConfig<…>): LocalStateHandle<…>;
function useStateData<…>(config: UseStateDataConfig<…>): RemoteStateHandle<…> | LocalStateHandle<…>; // impl
```

This is **non-breaking** (additive field; base handle and remote/local behavior unchanged) and the
discrimination is enforced **at the type level** (a remote call site gets `IAtom<IWrapped<TQuery>>`, a
local call site gets `IAtom<TQuery>`).

Local usage (the demo's path):

```ts
const { atom$, reload } = useStateData({ state: viewOptions, initial: { sort: "newest", compact: false } });
const compact$ = createLens(atom$, keyLens("compact")); // IAtom<boolean> — atom$ is IAtom<TQuery> here
const [compact, setCompact] = useAtom(compact$);         // ← checkbox, two-way
```

### New helper: `fulfilledLens` (in `rxfy`)

A tiny lens from the status wrapper to its FULFILLED value, used to build the local `atom$` and
reusable by consumers:

```ts
// packages/rxfy/src/wrapped/wrapped.ts (or lens) — exported
export function fulfilledLens<T>(): ILens<IWrapped<T>, T> {
  return {
    get: (w) => (w.type === StatusEnum.FULFILLED ? w.value : (undefined as never)),
    set: (value) => createFulfilled(value),
  };
}
```

### Implementation (`packages/rxfy-react/src/useStateData.ts`)

The internal wrapped atom (currently the local `atom$`, rename to `status$` to avoid shadowing the
returned field) backs both:

- **Remote:** return `atom$: status$` verbatim — it's already `Atom<IWrapped<TQuery>>` (an `IAtom`).
- **Local:** return `atom$: createLens(status$, fulfilledLens<TQuery>())` — an `IAtom<TQuery>`.
  `get()` reads the current FULFILLED value (always present in local mode); `set(v)` writes
  `createFulfilled(v)` back into `status$` (the query shape is written directly — correct for plain
  fields; entity slots already hold ids). `keyLens` then focuses any field.

Both are constructed inside the existing `useMemo`, so `atom$` is identity-stable across renders (the
demo memoizes its `createLens(atom$, keyLens(...))` on `[atom$]`). `atom$` shares the same underlying
atom as `data$`, so writes through either are mutually visible.

### Tests (`packages/rxfy-react/src/useStateData.local.test.tsx` + `useStateData.test.tsx`)

- Local: `atom$` is typed `IAtom<TQuery>`; `createLens(atom$, keyLens("compact"))` round-trips —
  `useAtom` reads the seeded value, `setCompact(true)` updates it, and `data$` reflects the change.
- Local: `reload()` resets `atom$`/`data$` back to `initial`.
- Remote: `atom$` is typed `IAtom<IWrapped<TQuery>>`; it emits the status wrapper (PENDING then
  FULFILLED) and `atom$.get()` is the current wrapped value.

### Changeset

`rxfy` (new `fulfilledLens`) + `rxfy-react` (`atom$` on the handle): **minor**.

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
const { atom$, reload } = useStateData({ state: viewOptionsState, initial: { sort: "…", compact: false } });
```

Drives the list's client-side sort and a `compact` density CSS class. **Keyless** (private per mount,
SSR-safe — UI prefs are not dehydrated). A "Reset" button calls `reload()`.

### B3. Lens-editable controls (`<ViewOptions>` component)

Each field is bound two-way through Lens on `atom$`:

```tsx
const compact$ = useMemo(() => createLens(atom$, keyLens("compact")), [atom$]);
const sort$ = useMemo(() => createLens(atom$, keyLens("sort")), [atom$]);
const [compact, setCompact] = useAtom(compact$); // <input type="checkbox">
const [sort, setSort] = useAtom(sort$);          // <select>
```

A single small `ViewOptions` component (per example, co-located) renders a checkbox (boolean) and a
select (enum), plus the Reset button. The list subscribes to `atom$` (via `useAtom`/`useObservable`)
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

- No `atom$` for remote mode (async contract); no persistence of view options (localStorage); no
  shared/keyed view-options slice (keyless keeps it simple and SSR-safe).
- No new entity fields or schema changes beyond the additive plain `meta` field.

## Affected files

- `packages/rxfy-react/src/useStateData.ts` — `RemoteStateHandle`/`LocalStateHandle`, `atom$`, overloads.
- `packages/rxfy-react/src/useStateData.local.test.tsx` — `atom$` + Lens tests.
- `.changeset/*` — `rxfy-react` minor.
- `examples/{next-blog,rr7-blog,waku-blog,vite-todo,vite-realtime-todos,vite-ssr-pagination}/**` —
  `ViewOptions` component + wiring; `meta` plain field on the five `defineState` examples.
- Docs: a short note on `atom$` in `react/use-state-data.mdx` and the rxfy skill (local-mode handle).
