# rxfy

## 1.0.1

### Patch Changes

- 9385b4e: Point package `homepage` at the documentation website (https://rxfy.vanya2h.me) and add documentation links to the READMEs.

## 1.0.0

### Major Changes

- 86fe0fa: First stable 1.0 release. Promotes `rxfy` and `rxfy-react` to a stable major now that the Atom/Lens/Wrapped data layer, normalized Model/State stores, and SSR support have settled into their public API.

### Minor Changes

- 70b8691: Preserve branded id types end to end. `EntityKey<T>` extracts the key type from an entity's `id` field, so `data# rxfy, `QueryShapeOf`, and `ModelStore.get`now carry branded types (e.g.`z.string().brand("PostId")`) instead of widening to `string`. `createModel`and`defineState`infer all three Zod generics (Output, Def, Input) —`z.ZodType<T>`placed`T`in the Input position too, which stripped brands during inference.`ModelDescriptor`gains an optional`TKey extends string`parameter inferred from`getKey`'s return type.
- 18812a9: Add `hydrationScript(state)` — returns the complete inline `<script>` tag that pushes a dehydrated snapshot onto `window.__RXFY_SSR__`, the queue `StoreProvider` drains automatically. Buffered and two-pass SSR setups no longer need a custom global or the `dehydratedState` prop; the prop remains for custom transports.
- d49cc70: Unify the data layer on the `Atom`/`Lens`/`Wrapped` primitives and remove the orphaned `Edge`/`Batcher`.

  - **Query status now lives in the data layer.** The registry's query cache owns one `Atom<IWrapped<QueryShape>>` per key (`queries.getQuery(key)`), seeded `IDLE`. `useStateData` drives status on that shared Atom instead of a per-handle `BehaviorSubject`, so queries sharing a key dedup automatically (including the in-flight `PENDING` window).
  - **`IWrapped` is the single async-status type.** The hand-rolled `QueryEntry` (query cache) and `IPendingStatus` (`usePending`) unions are gone. `usePending` now returns `IWrapped<T>`; the rejected variant no longer carries `onReload` — get reload from the `useStateData` handle's `reload()` (or `getAttachedReload(source$)`).
  - **`ModelStore` cells are `Atom`s**, and a new `ModelStore.entity(key): IAtom<T>` plus the new `useAtom` hook enable app-wide two-way binding: a field `Lens` over an entity stays in sync across every subscriber of that entity.
  - **SSR snapshots** now serialize as `SerializedWrapped` (`{ type: StatusEnum.FULFILLED | REJECTED, ... }`); only terminal states cross the wire.

  BREAKING: removes `Edge`/`createEdge`/`IEdge` and `batcher` from `rxfy`, and `useEdge`/`<Edge>` from `rxfy-react` (use `usePending` + `Pending`). `usePending`'s return type and the SSR wire format changed.

- 5c06619: First-class SSR support.

  - `useStateData` fetches on demand during SSR via Suspense — no manual prefetch API. Results are captured as fulfilled/rejected query-cache entries.
  - New `dehydrate`/`hydrate` serialize the query cache (entity ids) and named model stores (entities) across the server/client boundary; `StoreProvider` accepts `ssr`, `registry`, and `dehydratedState` props and ingests streamed `window.__RXFY_SSR__` chunks.
  - New `collectStateData` two-pass helper for strict `renderToString` environments; buffered `renderToPipeableStream` + `onAllReady` is the recommended non-streaming mode.
  - New `rxfy-react/next` subpath with `<HydrationStream />` for Next.js App Router streaming.
  - `createModel` accepts `name`, `defineState` accepts `key` — stable string identities required for SSR serialization.
  - Hydrated state renders fulfilled on first paint (`usePending` sync probe) — no loading flash, no re-fetch, no hydration mismatch.
  - `useObservable` skips notifications for deep-equal emissions, preventing re-render loops; `usePending` documents that `source# rxfy must be referentially stable.

  BREAKING: `data# rxfy now emits normalized query state — entity **ids** (`string`/`string[]`) instead of full entities. Read entity data through model stores (`useModelStore(model).get(id)`). Mutation reducers and `set()`are unchanged: they still operate on full entities; rxfy denormalizes the current ids into fresh entities before running your reducer and re-normalizes the result, so the manual`store.set(...)` + mutation two-step is no longer needed.

- ddacc0c: Add `added# rxfy — a stream of entities entering the store. `ModelStore.added# rxfy emits a key the first time its entity becomes present (the first `set`; updates don't re-emit), and replays the keys already present to new subscribers. `IModelRegistry.added# rxfy exposes the same signal across every named store as `{ name, key }`, replaying existing entities and following stores created later (unnamed stores are skipped). This lets a live-update layer subscribe to exactly what the client has loaded without each query wiring its ids in by hand.

## 1.0.0-rc.1

### Major Changes

- 86fe0fa: First stable 1.0 release. Promotes `rxfy` and `rxfy-react` to a stable major now that the Atom/Lens/Wrapped data layer, normalized Model/State stores, and SSR support have settled into their public API.

### Minor Changes

- 70b8691: Preserve branded id types end to end. `EntityKey<T>` extracts the key type from an entity's `id` field, so `data# rxfy, `QueryShapeOf`, and `ModelStore.get`now carry branded types (e.g.`z.string().brand("PostId")`) instead of widening to `string`. `createModel`and`defineState`infer all three Zod generics (Output, Def, Input) —`z.ZodType<T>`placed`T`in the Input position too, which stripped brands during inference.`ModelDescriptor`gains an optional`TKey extends string`parameter inferred from`getKey`'s return type.
- 18812a9: Add `hydrationScript(state)` — returns the complete inline `<script>` tag that pushes a dehydrated snapshot onto `window.__RXFY_SSR__`, the queue `StoreProvider` drains automatically. Buffered and two-pass SSR setups no longer need a custom global or the `dehydratedState` prop; the prop remains for custom transports.
- d49cc70: Unify the data layer on the `Atom`/`Lens`/`Wrapped` primitives and remove the orphaned `Edge`/`Batcher`.

  - **Query status now lives in the data layer.** The registry's query cache owns one `Atom<IWrapped<QueryShape>>` per key (`queries.getQuery(key)`), seeded `IDLE`. `useStateData` drives status on that shared Atom instead of a per-handle `BehaviorSubject`, so queries sharing a key dedup automatically (including the in-flight `PENDING` window).
  - **`IWrapped` is the single async-status type.** The hand-rolled `QueryEntry` (query cache) and `IPendingStatus` (`usePending`) unions are gone. `usePending` now returns `IWrapped<T>`; the rejected variant no longer carries `onReload` — get reload from the `useStateData` handle's `reload()` (or `getAttachedReload(source$)`).
  - **`ModelStore` cells are `Atom`s**, and a new `ModelStore.entity(key): IAtom<T>` plus the new `useAtom` hook enable app-wide two-way binding: a field `Lens` over an entity stays in sync across every subscriber of that entity.
  - **SSR snapshots** now serialize as `SerializedWrapped` (`{ type: StatusEnum.FULFILLED | REJECTED, ... }`); only terminal states cross the wire.

  BREAKING: removes `Edge`/`createEdge`/`IEdge` and `batcher` from `rxfy`, and `useEdge`/`<Edge>` from `rxfy-react` (use `usePending` + `Pending`). `usePending`'s return type and the SSR wire format changed.

- 5c06619: First-class SSR support.

  - `useStateData` fetches on demand during SSR via Suspense — no manual prefetch API. Results are captured as fulfilled/rejected query-cache entries.
  - New `dehydrate`/`hydrate` serialize the query cache (entity ids) and named model stores (entities) across the server/client boundary; `StoreProvider` accepts `ssr`, `registry`, and `dehydratedState` props and ingests streamed `window.__RXFY_SSR__` chunks.
  - New `collectStateData` two-pass helper for strict `renderToString` environments; buffered `renderToPipeableStream` + `onAllReady` is the recommended non-streaming mode.
  - New `rxfy-react/next` subpath with `<HydrationStream />` for Next.js App Router streaming.
  - `createModel` accepts `name`, `defineState` accepts `key` — stable string identities required for SSR serialization.
  - Hydrated state renders fulfilled on first paint (`usePending` sync probe) — no loading flash, no re-fetch, no hydration mismatch.
  - `useObservable` skips notifications for deep-equal emissions, preventing re-render loops; `usePending` documents that `source# rxfy must be referentially stable.

  BREAKING: `data# rxfy now emits normalized query state — entity **ids** (`string`/`string[]`) instead of full entities. Read entity data through model stores (`useModelStore(model).get(id)`). Mutation reducers and `set()`are unchanged: they still operate on full entities; rxfy denormalizes the current ids into fresh entities before running your reducer and re-normalizes the result, so the manual`store.set(...)` + mutation two-step is no longer needed.

- ddacc0c: Add `added# rxfy — a stream of entities entering the store. `ModelStore.added# rxfy emits a key the first time its entity becomes present (the first `set`; updates don't re-emit), and replays the keys already present to new subscribers. `IModelRegistry.added# rxfy exposes the same signal across every named store as `{ name, key }`, replaying existing entities and following stores created later (unnamed stores are skipped). This lets a live-update layer subscribe to exactly what the client has loaded without each query wiring its ids in by hand.

## 1.0.0-rc.0

### Major Changes

- 86fe0fa: First stable 1.0 release. Promotes `rxfy` and `rxfy-react` to a stable major now that the Atom/Lens/Wrapped data layer, normalized Model/State stores, and SSR support have settled into their public API.

### Minor Changes

- 70b8691: Preserve branded id types end to end. `EntityKey<T>` extracts the key type from an entity's `id` field, so `data$`, `QueryShapeOf`, and `ModelStore.get` now carry branded types (e.g. `z.string().brand("PostId")`) instead of widening to `string`. `createModel` and `defineState` infer all three Zod generics (Output, Def, Input) — `z.ZodType<T>` placed `T` in the Input position too, which stripped brands during inference. `ModelDescriptor` gains an optional `TKey extends string` parameter inferred from `getKey`'s return type.
- 18812a9: Add `hydrationScript(state)` — returns the complete inline `<script>` tag that pushes a dehydrated snapshot onto `window.__RXFY_SSR__`, the queue `StoreProvider` drains automatically. Buffered and two-pass SSR setups no longer need a custom global or the `dehydratedState` prop; the prop remains for custom transports.
- d49cc70: Unify the data layer on the `Atom`/`Lens`/`Wrapped` primitives and remove the orphaned `Edge`/`Batcher`.

  - **Query status now lives in the data layer.** The registry's query cache owns one `Atom<IWrapped<QueryShape>>` per key (`queries.getQuery(key)`), seeded `IDLE`. `useStateData` drives status on that shared Atom instead of a per-handle `BehaviorSubject`, so queries sharing a key dedup automatically (including the in-flight `PENDING` window).
  - **`IWrapped` is the single async-status type.** The hand-rolled `QueryEntry` (query cache) and `IPendingStatus` (`usePending`) unions are gone. `usePending` now returns `IWrapped<T>`; the rejected variant no longer carries `onReload` — get reload from the `useStateData` handle's `reload()` (or `getAttachedReload(source$)`).
  - **`ModelStore` cells are `Atom`s**, and a new `ModelStore.entity(key): IAtom<T>` plus the new `useAtom` hook enable app-wide two-way binding: a field `Lens` over an entity stays in sync across every subscriber of that entity.
  - **SSR snapshots** now serialize as `SerializedWrapped` (`{ type: StatusEnum.FULFILLED | REJECTED, ... }`); only terminal states cross the wire.

  BREAKING: removes `Edge`/`createEdge`/`IEdge` and `batcher` from `rxfy`, and `useEdge`/`<Edge>` from `rxfy-react` (use `usePending` + `Pending`). `usePending`'s return type and the SSR wire format changed.

- 5c06619: First-class SSR support.

  - `useStateData` fetches on demand during SSR via Suspense — no manual prefetch API. Results are captured as fulfilled/rejected query-cache entries.
  - New `dehydrate`/`hydrate` serialize the query cache (entity ids) and named model stores (entities) across the server/client boundary; `StoreProvider` accepts `ssr`, `registry`, and `dehydratedState` props and ingests streamed `window.__RXFY_SSR__` chunks.
  - New `collectStateData` two-pass helper for strict `renderToString` environments; buffered `renderToPipeableStream` + `onAllReady` is the recommended non-streaming mode.
  - New `rxfy-react/next` subpath with `<HydrationStream />` for Next.js App Router streaming.
  - `createModel` accepts `name`, `defineState` accepts `key` — stable string identities required for SSR serialization.
  - Hydrated state renders fulfilled on first paint (`usePending` sync probe) — no loading flash, no re-fetch, no hydration mismatch.
  - `useObservable` skips notifications for deep-equal emissions, preventing re-render loops; `usePending` documents that `source$` must be referentially stable.

  BREAKING: `data$` now emits normalized query state — entity **ids** (`string`/`string[]`) instead of full entities. Read entity data through model stores (`useModelStore(model).get(id)`). Mutation reducers and `set()` are unchanged: they still operate on full entities; rxfy denormalizes the current ids into fresh entities before running your reducer and re-normalizes the result, so the manual `store.set(...)` + mutation two-step is no longer needed.

- ddacc0c: Add `added$` — a stream of entities entering the store. `ModelStore.added$` emits a key the first time its entity becomes present (the first `set`; updates don't re-emit), and replays the keys already present to new subscribers. `IModelRegistry.added$` exposes the same signal across every named store as `{ name, key }`, replaying existing entities and following stores created later (unnamed stores are skipped). This lets a live-update layer subscribe to exactly what the client has loaded without each query wiring its ids in by hand.
