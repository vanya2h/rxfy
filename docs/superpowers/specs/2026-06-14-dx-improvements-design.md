# rxfy DX Improvements — Design

Date: 2026-06-14

## Summary

Five developer-experience improvements to the `rxfy` / `rxfy-react` libraries, identified
in a framework assessment. The core is well-architected; the friction is concentrated in the
React consumption surface and the docs. This batch adds the two highest-leverage missing hooks
(`useEntity`, `useStateEntities`), hardens `entity()`, adds a comparator escape hatch on
`createLens`, and fills the two critical doc gaps (error handling, testing) plus a runnable
quickstart.

Scope: items **1, 2, 4, 6, 8** from the assessment. Items 3 (async mutations) and 5 (live-update
primitive) are explicitly out of scope.

## Item 1 — `useEntity` / `useEntity$`

**Problem.** The single most-repeated pattern in every example is `useModelStore` →
`useMemo(() => store.get(id), [store, id])` → `<Pending>`. Three concepts assembled by hand for
the most common operation in the library.

**Design.** Two thin hooks in `rxfy-react`, no new core logic.

```ts
// declarative — stable memoized observable for <Pending value$={...}>
function useEntity$<T>(model: ModelDescriptor<T>, id: EntityKey<T>): Observable<T>;

// imperative — status object, caller switches on type
function useEntity<T>(model: ModelDescriptor<T>, id: EntityKey<T>): IWrapped<T, StatusEnum.PENDING | StatusEnum.FULFILLED>;
```

- `useEntity$` = `useModelStore(model)` + `useMemo(() => store.get(id), [store, id])`. This is the
  boilerplate from the examples, lifted into one call.
- `useEntity` = `usePending(useEntity$(model, id))`. `store.get` is already `markSync`-wrapped, so
  `usePending`'s sync-probe yields a hydrated entity with no pending flash; an unloaded entity
  starts `PENDING`. `store.get` never errors, so `REJECTED` is impossible — hence the narrowed
  return type.

Both exported from `rxfy-react`'s index.

## Item 2 — `useStateEntities`

**Problem.** `useStateData` returns `data$` (entity ids only). To render, consumers map ids →
`store.get(id)` per field, compose fields with raw RxJS `combineLatest` (next-blog `PostDetail`
does this by hand), and hand-write the denormalized id type even though `QueryShapeOf<TShape>`
already computes it.

**Design.** Denormalization logic lives in **core** (pure, unit-testable without React); the React
hook is a thin wire-up.

**Core** — new helper next to `denormalizeValue` in `state/normalize.ts`:

```ts
function denormalizeShape$<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  ids$: Observable<QueryShapeOf<TShape>>,
): Observable<TShape>;
```

Behavior:
- `switchMap` on each `ids$` emission — re-subscribe when the query shape changes (add / remove /
  reorder).
- Per field, build the entity stream: `single` → `store.get(id)`; `array` →
  `combineLatest(ids.map(id => store.get(id)))`, guarded `ids.length ? combineLatest(...) : of([])`
  because an empty `combineLatest` never emits.
- `combineLatest` across all fields and reassemble the `TShape` object. Guard the no-fields edge
  case (emit `{}`).
- Wrap the output in `markSync` so a hydrated / cache-hit shape emits synchronously and
  `usePending` shows no pending flash. The probe is safe — only rxfy observables are marked.

This is reactive to **both** id changes and individual entity field updates (the live-update
promise). A plain `map(denormalizeValue)` would only re-emit on id changes and miss entity edits —
rejected for that reason.

**React** — `useStateEntities` in `rxfy-react`:

```ts
function useStateEntities<TParams, TShape, TMutations extends MutationDefs<TShape>>(
  state: StateDescriptor<TParams, TShape, TMutations>,
  handle: StateHandle<TShape, TMutations>,
): Observable<TShape>;
// = useMemo(() => denormalizeShape$(registry, state.fields, handle.data$), [state, handle, registry])
```

Returns `Observable<TShape>`, rendered with `<Pending value$={entities$}>`. `TShape` is inferred
from `state` — no hand-written id type. Passing `state` again (already in scope at the
`useStateData` call site) keeps `StateHandle` minimal. Exported from `rxfy-react`'s index.

## Item 6 — `entity()` loaded-contract guard

**Problem.** `entity(key)` returns `IAtom<T>` but the underlying cell is `Atom<T | undefined>`.
Its lens does `get: (source) => source as T`, so reading an entity during the "referenced before
loaded" window hands back `undefined` typed as `T`, crashing downstream (`undefined.title`) with no
hint why.

**Invariant context.** Through the normalized dataflow this cannot happen: `normalizeResult` calls
`store.set`/`setMany` *before* producing ids, so any id in `data$` provably corresponds to a loaded
entity, and `denormalizeValue` already throws on a missing entity. The undefined window only opens
for ids that enter from **outside** the normalized flow (URL param, websocket key-only event,
hand-written id) read before load. The guard is therefore a defensive assertion of an existing
invariant, consistent with `denormalizeValue`'s throw.

**Design.** Keep `entity(key): IAtom<T>` (so `keyLens` composition stays clean — the primary use
case is form binding on an already-loaded entity). Make the lie loud:

```ts
entity: (key) =>
  createLens<T | undefined, T>(getCell(key as string), {
    get: (source) => {
      if (source === undefined)
        throw new Error(
          `rxfy: entity "${key}" for model "${descriptor.name ?? "<unnamed>"}" is not loaded — ` +
            `guard with <Pending>/useEntity or seed it first`,
        );
      return source;
    },
    set: (current) => current,
  }),
```

Because `Lens` reads its initial value at construction (`lens.get(source$.get())`),
`entity(unloadedId)` throws **at the call site** (inside the consumer's `useMemo`) — loud and
located. Loaded usage is unchanged. Update the doc comment on the `ModelStore.entity` type to state
the contract. Verify existing tests seed before calling `entity()` (`model-store.test.ts:203`,
`form-sync.test.tsx`) and adjust only if one does not.

## Item 8 — `equals` option on `createLens`

**Problem.** `Lens` uses `lodash.isEqual` unconditionally for change detection. For large entities
at high update rates this is a real cost with no escape hatch.

**Design.** Optional comparator, lens-only (per scope decision):

```ts
function createLens<TSource, TTarget>(
  source$: IAtom<TSource>,
  lens: ILens<TSource, TTarget>,
  opts?: { equals?: (a: TTarget, b: TTarget) => boolean },
);
```

Default `equals` = `_.isEqual` (current behavior, fully backwards compatible). Thread it through the
three comparison sites in `Lens`:
- the `distinctUntilChanged` on the source → subject sync,
- the `tap` write guard,
- the `set` write-back guard.

`useObservable` / `usePending` are untouched.

## Item 4 — Docs

**`getting-started.mdx`** — add a "Your first state" section between "Wrap your app" and "Next
steps": one runnable end-to-end example (model → `defineState` → fetcher → `useStateData` +
`useEntity` / `<Pending>`) so a new dev can copy-paste something that runs. Showcases the new hooks
so the docs and API land together.

**New page `guides/error-handling.mdx`** — the `IDLE/PENDING/FULFILLED/REJECTED` model;
`<Pending rejected={...}>` and the `reload()` retry pattern; that `REJECTED` is only ever an
initial-fetch failure (per the `useStateData` contract comment); the `void handler(e).catch(...)`
async-event-handler idiom; the `entity()` loaded-contract from item 6.

**New page `guides/testing.mdx`** — rendering under `ModelRegistryContext.Provider` with a fresh
`createModelRegistry()`; seeding stores via `registry.model(M).set(...)` (the pattern in
`form-sync.test.tsx`); mocking fetchers passed to `useStateData`; asserting on `useEntity` / store
values.

**Touch-ups:**
- `react.mdx` — document `useEntity`, `useEntity$`, `useStateEntities`.
- `models-state.mdx` — note the `entity()` loaded-contract.
- `core-concepts/lens.mdx` — document the `equals` option.

**Sidebar (`vocs.config.ts`)** — add both new pages under the existing **Guides** group, ordered:
Error handling, Testing, Live updates over WebSockets.

## Testing strategy

- **Core (`rxfy`):**
  - `denormalizeShape$` — unit tests in `state/normalize.test.ts`: single + array fields reassemble
    correctly; re-emits on id change (add/remove/reorder); re-emits on individual entity field
    update; empty array field emits `[]`; output is `markSync`-tagged and emits synchronously when
    all entities present.
  - `entity()` guard — `model-store.test.ts`: throws with a descriptive message when read before
    load; works unchanged after `set`.
  - `createLens` `equals` — `lens.test.ts`: custom comparator suppresses / allows emissions as
    expected; default behavior unchanged when `opts` omitted.
- **React (`rxfy-react`):**
  - `useEntity` / `useEntity$` — new test file: pending before load, fulfilled after `set`, no
    pending flash for a pre-seeded (hydrated) store.
  - `useStateEntities` — new test file: renders the denormalized shape; reflects an entity edit
    without an id change.
- All work is TDD: failing test first, then implementation.

## Out of scope

- Item 3 (async mutations with optimistic update / rollback).
- Item 5 (promoting the live-update client into a shipped primitive).
- Threading the comparator beyond `createLens` (into `useObservable` / `usePending`).
- Changing `entity()` to `IAtom<T | undefined>`.

## Changeset

Add a changeset covering `rxfy` (new `denormalizeShape$` export, `entity()` guard, `createLens`
`equals` option) and `rxfy-react` (new `useEntity`, `useEntity$`, `useStateEntities` exports). All
changes are additive / backwards compatible except the `entity()` guard, which converts previously
silent `undefined`-typed-as-`T` reads into a throw — a behavior change for incorrect usage only.
