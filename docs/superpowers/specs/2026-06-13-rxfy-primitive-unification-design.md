# rxfy Primitive Unification — Design

**Date:** 2026-06-13
**Status:** Approved design, ready for implementation planning

## Problem

`packages/rxfy` currently ships two disconnected mental models under one name:

- **Reactive primitives** — `Atom`, `Edge`, `Lens`, `Wrapped` (RxJS-based cells).
- **Data layer** — `defineState`, `ModelStore`/`ModelRegistry`, the query cache, `normalize`, and the SSR/hydration tree.

The data layer imports nothing from the primitives. `Edge` and `Lens` have zero internal consumers, `Batcher` is never even exported, and the same async-status concept is hand-rolled **three** separate times:

- `Wrapped` / `StatusEnum` (`IDLE | PENDING | FULFILLED | REJECTED`) in core.
- `QueryEntry` (`fulfilled | rejected`) in `query-cache.ts`.
- `IPendingStatus` (`pending | rejected | fulfilled`) in `usePending.ts`.

`Edge` is a sound abstraction but orphaned: it duplicates the data layer's job (async fetch + status tracking). The result is two answers to "how do I load data."

## Goal

Make the data layer **compose** the primitives the project is keeping — `Atom`, `Lens`, `Wrapped` — and delete the ones it does not (`Edge`, `Batcher`). After this work:

- `Wrapped` is the single async-status type across core and React.
- A query's status lives in the data layer as real, observable state (`Atom<IWrapped<…>>`), not synthesized at render time.
- Entity cells are `Atom`s, enabling app-wide two-way binding.
- `Lens` earns its keep as the entity-field handle that powers form inputs.
- `Edge` and `Batcher` are gone; their behavior is reabsorbed by the data layer.

Non-goal: this is not a rewrite of `defineState`'s public shape, the normalization model, or the SSR suspend strategy. Those stay; only their internals change.

## Scope decisions (locked during brainstorming)

| Decision                  | Choice                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Seams in scope            | All three: Wrapped, Atom, Lens                                                                                       |
| Edge / Batcher            | Remove both in this spec                                                                                             |
| Where query status lives  | In the data layer — `Atom<IWrapped<…>>` owned by the registry                                                        |
| Query ownership           | Approach A — registry owns one Atom per cache key; no per-handle subject                                             |
| Lens scope                | Entity-field handle + `useAtom` + app-wide two-way sync (core scope). Whole-shape reactive denormalization deferred. |
| Wire-format compatibility | Free to change — library is pre-release, SSR snapshot is same-build                                                  |

## Design

The work is three stacked seams plus a cleanup. They build on each other: the Lens form-binding only reaches the whole app because the entity cell became a shared `Atom`.

### Seam 1 — `Wrapped` as the universal status type

**1a. Collapse three unions into one.** `IWrapped` / `StatusEnum` becomes the single status type. Delete:

- `QueryEntry` (`packages/rxfy/src/query/query-cache.ts:3-5`) → `IWrapped`.
- `IPendingStatus` (`packages/rxfy-react/src/usePending.ts:24-30`) → `IWrapped`.

**1b. Decouple reload from status.** `IPendingStatus`'s rejected variant bakes an `onReload` callback into the status object. `IWrapped.REJECTED` is pure data (`{ type, error }`). So:

- `usePending` returns a plain `IWrapped<T>`.
- Reload stays reachable via the existing `attachReload` / `getAttachedReload` mechanism and `handle.reload`.
- `Pending` / `BehaviorSubjectRender` wire reload from there rather than from the status object.

Status becomes data; reload becomes an action.

**1c. Error at the SSR boundary only.** In memory, `REJECTED.error` is a live `unknown`. The `SerializedError` conversion happens exclusively at serialize/hydrate (see Seam 4b). `IWrapped`'s type never references `SerializedError`.

### Seam 2 — Query ownership: registry owns `Atom<IWrapped>` (Approach A)

The registry's query cache becomes the owner of one `Atom<IWrapped<QueryShape>>` per cache key.

- **New cache surface:** `getQuery(cacheKey) → Atom<IWrapped<QueryShape>>`, get-or-create, seeded `IDLE`. The cache's internal map changes from `Map<string, QueryEntry>` to `Map<string, Atom<IWrapped<QueryShape>>>`.
- **`useStateData` looks up the Atom** instead of creating a per-handle `BehaviorSubject` (today's `useStateData.ts:70` is removed). On mount with `IDLE`: set `PENDING`, fetch, then `normalizeResult` → set `FULFILLED(ids)` or `REJECTED(error)`.
- **`data$`** is derived from the Atom: `atom.pipe(filter → FULFILLED, map → value)`.
- **Dedup is automatic:** two components on the same cache key share one Atom, including the in-flight PENDING window. Client-side dedup no longer needs the promise map.
- **`set` / mutations:** read current `FULFILLED` ids → `denormalizeValue` → apply reducer → `normalizeResult` → set `FULFILLED` again on the same Atom.
- **Keyless states** (no `key`, opt out of SSR) cannot live in the shared keyed map. They get a per-handle ephemeral `Atom<IWrapped>` via the same code path — identical behavior, just not registry-shared.
- **`getPromise` / `setPromise` / `inflight` stay**, now used only for the SSR Suspense throw and server-side request dedup (`collect-state-data` reads `inflight()`).

This is the Edge cell — async value + observable status — owned by the store instead of standing alone.

### Seam 3 — Entity cells become `Atom`s, powering Lens form binding

**3a. `ModelStore` cell → `Atom`.** `createModelStore` (`packages/rxfy/src/model/model-store.ts:25-48`) today keeps two parallel maps: `ReplaySubject<T>(1)` for streams plus a `values` map for sync reads. Both collapse into `Map<string, Atom<T | undefined>>`:

- `set(key, val)` → get-or-create `Atom<T | undefined>(undefined)`, then `atom.set(val)`.
- `getValue(key)` → `atom?.get()` (still `T | undefined`; read-only, never creates).
- `get(key)` → `markSync(atom.pipe(filter(v => v !== undefined)))`.

The `filter(undefined)` preserves `ReplaySubject(1)`'s exact current behavior — nothing emitted before the first `set` — while keeping `getValue` synchronous. `markSync`'s sync probe sees the same (no emission before first set). No behavioral change for existing consumers.

**3b. Entity handle + field Lens (core).**

- `ModelStore.entity(key): IAtom<T>` — a writable handle over the entity's Atom cell. Reads reflect the store; `.set(next)` writes back into the cell (equivalent to `store.set(key, next)`). Valid once the entity is loaded (true post-fetch). Reading before load yields `undefined` cast through — the form scenario always edits a loaded entity.
- Per-field Lens is `createLens(entity$, keyLens("title")): IAtom<string>` — `keyLens` already exists. Optional sugar: `store.field(key, "title")`.

**3c. `useAtom` hook (React).** `useAtom(atom$: IAtom<T>): [T, (v: T) => void]` — a thin wrapper over the existing `useObservable`, returning the current value plus the atom's `set`. Works for any `IAtom`: the entity handle or a field Lens.

**The consumer experience this enables:**

```tsx
const post$ = useModelStore(Post).entity(postId); // IAtom<Post>
const title$ = useMemo(() => createLens(post$, keyLens("title")), [post$]);
const [title, setTitle] = useAtom(title$);
<input value={title} onChange={(e) => setTitle(e.target.value)} />;
```

Typing → `title$.set` → writes back through `post$` → the store cell emits → **every** subscriber of that Post (this form, a title in a list elsewhere, the query view) re-renders. Two-way, live, app-wide — only possible because 3a made the entity cell a shared `Atom`.

**Deferred (out of scope):** rebuilding a whole denormalized `TShape` as a live `combineLatest` over entity Atoms, and routing mutations back through per-entity Lenses. No current consumer needs a single live denormalized shape; mutations already work through `normalizeResult`. Noted as a future extension point.

### Seam 4 — Removals and SSR

**4a. Remove Edge and Batcher.**

- Core: delete `src/edge/` and `src/batcher/`; drop both exports from `src/index.ts`.
- React: delete `useEdge`, `Edge`, `IEdgeProps`, `IRenderFn`, `renderWithParams`, and the Edge test from `packages/rxfy-react/src/index.tsx`. Documented replacement: `usePending` + `Pending` / `BehaviorSubjectRender`.
- Verified no other consumers: `useEdge` / `<Edge>` / `createEdge` appear only in core `edge/` and rxfy-react's `index.tsx`. Neither example (`next-blog`, `vite-todo`) uses Edge.

**4b. SSR / serialization — split in-memory vs wire.** `IWrapped.REJECTED.error` is `unknown`, but a snapshot needs `SerializedError`. So:

- **In memory:** the query cache holds `Atom<IWrapped<QueryShape>>` with live errors.
- **On the wire:** a thin `SerializedWrapped<T>` DTO — only `FULFILLED { value }` / `REJECTED { error: SerializedError }` ever appear. IDLE/PENDING are transient: the server suspends until a query is terminal, so they never reach a snapshot. `hydration.ts:6` changes `Record<string, QueryEntry>` → `Record<string, SerializedWrapped>`.
- **Convert at the boundary:** serialize maps `IWrapped → SerializedWrapped` (error → `serializeError`); hydrate seeds each Atom at `FULFILLED`, or `REJECTED` via `rehydrateError`.
- The `getPromise` / `setPromise` / `inflight` slot is unchanged.

## Component boundaries

| Unit           | Responsibility                                                                                  | Depends on                                  |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `Wrapped`      | The status union + constructors                                                                 | nothing                                     |
| `query-cache`  | Owns `Atom<IWrapped>` per key; in-flight promise slot; serialize/hydrate of `SerializedWrapped` | `Atom`, `Wrapped`, `serialize`              |
| `model-store`  | `Atom<T\|undefined>` per entity; `entity()` handle                                              | `Atom`, `Lens` (for `entity`/`field` sugar) |
| `Lens`         | Optic over an `IAtom`; `keyLens` for fields                                                     | `Atom`                                      |
| `useStateData` | Looks up query Atom, drives fetch → status, derives `data$`, mutations                          | `query-cache`, `normalize`                  |
| `usePending`   | Thin subscriber → `IWrapped<T>`; reload via `attachReload`                                      | `Wrapped`, `useObservable`                  |
| `useAtom`      | `IAtom<T>` → `[value, set]`                                                                     | `useObservable`                             |

## Testing strategy

**Core unit:**

- `query-cache`: get-or-create seeded `IDLE`; `IDLE → PENDING → FULFILLED/REJECTED` transitions; shared-Atom dedup across two `getQuery` calls; `serialize ↔ hydrate` roundtrip of `SerializedWrapped`.
- `model-store`: sync `getValue`; `get` filters `undefined` and emits nothing before first `set`; `setMany`; `entity()` write-back reaches the cell.
- `lens`: extend `lens.test.ts` for the store-backed entity handle (field edit propagates to the cell and back).

**React:**

- `useStateData`: cache-hit sync render, miss → fetch, `reload`, mutations against the shared Atom.
- `usePending`: returns `IWrapped<T>`; reload resolved via `attachReload`.
- `useAtom`: returns `[value, set]`; two-way — editing through a field Lens re-renders an independent subscriber of the same entity.
- SSR: suspend on miss → hydrate roundtrip restores `FULFILLED` and `REJECTED` correctly.

Remove the Edge tests.

**Gates:** `turbo build`, `turbo test`, `turbo check-types`, `turbo lint`.

## Suggested implementation phasing

The seams stack, so implement in dependency order; each phase keeps the suite green:

1. **Seam 1** — introduce `IWrapped` everywhere the three unions live (type-level), keeping behavior.
2. **Seam 2** — move query state into registry-owned `Atom<IWrapped>`; rewire `useStateData`; `usePending` becomes a thin subscriber.
3. **Seam 3** — `ModelStore` Atom cell, `entity()` handle, `useAtom`, form-binding sync.
4. **Seam 4** — delete Edge + Batcher and their exports/tests; finalize `SerializedWrapped` SSR boundary.
