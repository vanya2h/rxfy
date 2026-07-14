# rxfy

## 3.0.0-rc.1

### Major Changes

- f4cf59f: Entity grants: the signed grant now names the exact entity topics it authorizes.

  `live.serve` extracts the served payload's `name:id` topics and signs them into the grant claims;
  the `subscribe` frame drops its `entities` field (the client forwards only the grant); the WS server
  subscribes to `channel + claims.entities` alone. Entity ids no longer need to be unguessable — a grant
  authorizes a fixed, signed set. SSR reuses the served grant verbatim (`grantsHydration` no longer signs;
  its `secret`/`ttlMs` options are removed). New `collectShapeTopics` export in `rxfy`.

- 630ab6f: Automatic live subscriptions via signed channel grants — the declared-grant flow is removed.

  `live.serve(state, params, data)` signs a per-state JWT grant (channel + expiry) and attaches it
  to the parsed payload as `$grant`; `useStateData` lifts it automatically and subscribes with the
  payload's entity topics. Nothing to declare, no keyer, no fetch-client wiring.

  - `rxfy`: hydration payload carries `grants: string[]`; new `collectEntityTopics`.
  - `rxfy-protocol`: v2 — `subscribe { grant, entities }` is the only client frame; hashed-token
    subscribe/unsubscribe frames are gone.
  - `rxfy-server`: `createServer` requires `secret`; `serve` returns the parsed shape + `$grant`;
    new `renew`; hub is socket-keyed with grant expiry; `createTopicKeyer`, `grant`, `GrantSpec`,
    `Grants` are removed.
  - `rxfy-ws`: the server verifies grants on `subscribe`; the client transport is `send`/`onOpen`.
  - `rxfy-react`: `useStateData` lifts `$grant`; `addGrants` and grant props are removed.

  SECURITY: the grant authorizes both the channel and the exact entity topics it was signed for (see
  the entity-grants changeset), so entity ids need not be unguessable. Keep `Cache-Control: private,
no-store` on state endpoints as ordinary response hygiene (the payload carries a bearer grant).

- 02995d1: `createModel` now requires `name` (and `ModelDescriptor.name` is non-optional). The name is the model's stable string identity for SSR dehydration and live topics, and making it mandatory removes every unnamed-model fallback path:

  - `dehydrate` no longer skips stores (and the "model store holds data but has no name" dev warning is gone) — every store serializes.
  - `modelTopic` no longer throws for unnamed models.
  - The registry's `added# rxfy covers every store; the "unnamed stores are skipped" carve-out is gone.
  - Error messages always carry the real model name (no more `<unnamed>`).

  Migration: add `name: "..."` to any `createModel` call that omitted it. Names must be unique per app — duplicates still trigger the registry's dev warning since their entities would mix in `dehydrate` output.

- 02995d1: `defineState` now requires `key`, and `StateDescriptor.key` is a required `string`. Every state participates in the SSR query cache and derives a live invalidation channel; the keyless opt-out is gone. Keyed descriptors are now directly assignable to key-requiring inputs such as rxfy-server's `StateChannelDescriptor`, so `touch(postsState, params)` works without a cast. `useStateData` drops the keyless code paths (private per-mount query atom and the SSR "cannot be fetched" warning). A `_shape` phantom carrier was added to `StateDescriptor` so `TShape` is structurally inferable from a descriptor value.

  Migration: add a unique `key` to any `defineState` call that omitted one.

- 02995d1: BREAKING: `ModelStore.get(key)` now returns a writable `IAtom<T>` (the former `entity(key)` handle) instead of a filtering `Observable<T>`, and `ModelStore.entity` is removed. Accessing a key that has never been `set` **throws** instead of returning an observable that waits silently — ids are expected to come from fulfilled states, which always normalize their entities into the store before handing out ids, so an unloaded access is a programming error surfaced early.

  - `get(id)` reads synchronously (`.get()`), subscribes reactively (it is still an `Observable`), and writes back (`.set()` / `.modify()`), exactly like `entity(id)` did.
  - `get(id)` returns the entity's cell itself — a stable identity across calls, with no per-call wrapper allocation. Store cells are only created on `set`, so a cell existing means its entity is loaded.
  - `get()` results are no longer sync-marked — no `usePending`/`<Pending>` probe is involved; entity reads carry no async status at all.

  Migration:

  - `store.entity(id)` → `store.get(id)` (same semantics).
  - `<Pending value$={store.get(id)}>{(x) => …}</Pending>` → `const [x] = useAtom(useMemo(() => store.get(id), [store, id]))` and render directly.
  - `combineLatest({ a: storeA.get(ia), b: storeB.get(ib) })` → two `useAtom` reads.
  - To probe for presence without throwing, use `store.getValue(id)`.

### Minor Changes

- 9984591: `live.serve(state, params, data)` now accepts the state's _input_ shape and parses it through the field schemas instead of passing data through untouched. Raw DB rows — unbranded ids, extra columns like `createdAt` — go in with no casts; the returned payload has ids branded and unknown keys stripped. This changes `serve`'s behavior: the result is a new parsed object (not the same reference), and invalid data now throws.

  To support this, rxfy threads the zod Input type through the descriptors: `ModelDescriptor`, `FieldDescriptor`, and `StateDescriptor` gain a trailing input type parameter (defaulted, non-breaking), `defineState` derives it via the new `InputShapeFromFields`, and the new `parseShape(fields, input)` helper performs the parse.

- 02995d1: `IModelRegistry` is now generic over its registered models, accumulated as a name-keyed record: `createModelRegistry(postModel).add(commentModel)` types the registry as `IModelRegistry<{ post: typeof postModel; comment: typeof commentModel }>`. On a typed registry:

  - `registry.store("post")` is a typed lookup returning `ModelStore<Post>` (new method; throws if the store was never materialized).
  - `registry.model(descriptor)` only accepts registered descriptors at compile time.
  - `registry.stashHydration(name, entities)` checks the name against registered models and the entities against that model's entity type.
  - `registry.namedStores()` keys are the registered model names, and its values the union of the registered stores (use `store(name)` for a per-name type).

  The closed set is a compile-time guard only — runtime behavior is unchanged, and `.add()` just materializes the store (idempotent) and returns the same registry. Bare `IModelRegistry` and no-arg `createModelRegistry()` remain the open registry: any descriptor is accepted lazily exactly as before, and typed registries are assignable wherever `IModelRegistry` is expected, so no consuming signatures change.

  To support name-keyed typing, `createModel` now captures `name` as a literal type via a trailing `TName extends string = string` generic on `ModelDescriptor`/`CreateModelConfig` (non-breaking). Also exports `AnyModelDescriptor` and `ModelsShape`.

### Patch Changes

- 02995d1: `defineState`'s `window` option (and `StateDescriptor.window`) is now typed as `readonly (keyof TParams & string)[]` instead of `readonly string[]`, so window entries must name declared params — a typo'd entry is a compile error instead of a silently ignored dimension.

## 3.0.0-rc.0

### Major Changes

- f4cf59f: Entity grants: the signed grant now names the exact entity topics it authorizes.

  `live.serve` extracts the served payload's `name:id` topics and signs them into the grant claims;
  the `subscribe` frame drops its `entities` field (the client forwards only the grant); the WS server
  subscribes to `channel + claims.entities` alone. Entity ids no longer need to be unguessable — a grant
  authorizes a fixed, signed set. SSR reuses the served grant verbatim (`grantsHydration` no longer signs;
  its `secret`/`ttlMs` options are removed). New `collectShapeTopics` export in `rxfy`.

- 630ab6f: Automatic live subscriptions via signed channel grants — the declared-grant flow is removed.

  `live.serve(state, params, data)` signs a per-state JWT grant (channel + expiry) and attaches it
  to the parsed payload as `$grant`; `useStateData` lifts it automatically and subscribes with the
  payload's entity topics. Nothing to declare, no keyer, no fetch-client wiring.

  - `rxfy`: hydration payload carries `grants: string[]`; new `collectEntityTopics`.
  - `rxfy-protocol`: v2 — `subscribe { grant, entities }` is the only client frame; hashed-token
    subscribe/unsubscribe frames are gone.
  - `rxfy-server`: `createServer` requires `secret`; `serve` returns the parsed shape + `$grant`;
    new `renew`; hub is socket-keyed with grant expiry; `createTopicKeyer`, `grant`, `GrantSpec`,
    `Grants` are removed.
  - `rxfy-ws`: the server verifies grants on `subscribe`; the client transport is `send`/`onOpen`.
  - `rxfy-react`: `useStateData` lifts `$grant`; `addGrants` and grant props are removed.

  SECURITY: the grant authorizes both the channel and the exact entity topics it was signed for (see
  the entity-grants changeset), so entity ids need not be unguessable. Keep `Cache-Control: private,
no-store` on state endpoints as ordinary response hygiene (the payload carries a bearer grant).

- 02995d1: `createModel` now requires `name` (and `ModelDescriptor.name` is non-optional). The name is the model's stable string identity for SSR dehydration and live topics, and making it mandatory removes every unnamed-model fallback path:

  - `dehydrate` no longer skips stores (and the "model store holds data but has no name" dev warning is gone) — every store serializes.
  - `modelTopic` no longer throws for unnamed models.
  - The registry's `added# rxfy covers every store; the "unnamed stores are skipped" carve-out is gone.
  - Error messages always carry the real model name (no more `<unnamed>`).

  Migration: add `name: "..."` to any `createModel` call that omitted it. Names must be unique per app — duplicates still trigger the registry's dev warning since their entities would mix in `dehydrate` output.

- 02995d1: `defineState` now requires `key`, and `StateDescriptor.key` is a required `string`. Every state participates in the SSR query cache and derives a live invalidation channel; the keyless opt-out is gone. Keyed descriptors are now directly assignable to key-requiring inputs such as rxfy-server's `StateChannelDescriptor`, so `touch(postsState, params)` works without a cast. `useStateData` drops the keyless code paths (private per-mount query atom and the SSR "cannot be fetched" warning). A `_shape` phantom carrier was added to `StateDescriptor` so `TShape` is structurally inferable from a descriptor value.

  Migration: add a unique `key` to any `defineState` call that omitted one.

- 02995d1: BREAKING: `ModelStore.get(key)` now returns a writable `IAtom<T>` (the former `entity(key)` handle) instead of a filtering `Observable<T>`, and `ModelStore.entity` is removed. Accessing a key that has never been `set` **throws** instead of returning an observable that waits silently — ids are expected to come from fulfilled states, which always normalize their entities into the store before handing out ids, so an unloaded access is a programming error surfaced early.

  - `get(id)` reads synchronously (`.get()`), subscribes reactively (it is still an `Observable`), and writes back (`.set()` / `.modify()`), exactly like `entity(id)` did.
  - `get(id)` returns the entity's cell itself — a stable identity across calls, with no per-call wrapper allocation. Store cells are only created on `set`, so a cell existing means its entity is loaded.
  - `get()` results are no longer sync-marked — no `usePending`/`<Pending>` probe is involved; entity reads carry no async status at all.

  Migration:

  - `store.entity(id)` → `store.get(id)` (same semantics).
  - `<Pending value$={store.get(id)}>{(x) => …}</Pending>` → `const [x] = useAtom(useMemo(() => store.get(id), [store, id]))` and render directly.
  - `combineLatest({ a: storeA.get(ia), b: storeB.get(ib) })` → two `useAtom` reads.
  - To probe for presence without throwing, use `store.getValue(id)`.

### Minor Changes

- 9984591: `live.serve(state, params, data)` now accepts the state's _input_ shape and parses it through the field schemas instead of passing data through untouched. Raw DB rows — unbranded ids, extra columns like `createdAt` — go in with no casts; the returned payload has ids branded and unknown keys stripped. This changes `serve`'s behavior: the result is a new parsed object (not the same reference), and invalid data now throws.

  To support this, rxfy threads the zod Input type through the descriptors: `ModelDescriptor`, `FieldDescriptor`, and `StateDescriptor` gain a trailing input type parameter (defaulted, non-breaking), `defineState` derives it via the new `InputShapeFromFields`, and the new `parseShape(fields, input)` helper performs the parse.

- 02995d1: `IModelRegistry` is now generic over its registered models, accumulated as a name-keyed record: `createModelRegistry(postModel).add(commentModel)` types the registry as `IModelRegistry<{ post: typeof postModel; comment: typeof commentModel }>`. On a typed registry:

  - `registry.store("post")` is a typed lookup returning `ModelStore<Post>` (new method; throws if the store was never materialized).
  - `registry.model(descriptor)` only accepts registered descriptors at compile time.
  - `registry.stashHydration(name, entities)` checks the name against registered models and the entities against that model's entity type.
  - `registry.namedStores()` keys are the registered model names, and its values the union of the registered stores (use `store(name)` for a per-name type).

  The closed set is a compile-time guard only — runtime behavior is unchanged, and `.add()` just materializes the store (idempotent) and returns the same registry. Bare `IModelRegistry` and no-arg `createModelRegistry()` remain the open registry: any descriptor is accepted lazily exactly as before, and typed registries are assignable wherever `IModelRegistry` is expected, so no consuming signatures change.

  To support name-keyed typing, `createModel` now captures `name` as a literal type via a trailing `TName extends string = string` generic on `ModelDescriptor`/`CreateModelConfig` (non-breaking). Also exports `AnyModelDescriptor` and `ModelsShape`.

### Patch Changes

- 02995d1: `defineState`'s `window` option (and `StateDescriptor.window`) is now typed as `readonly (keyof TParams & string)[]` instead of `readonly string[]`, so window entries must name declared params — a typo'd entry is a compile error instead of a silently ignored dimension.

## 2.0.0

### Minor Changes

- a833885: Add the optional `window` field to `defineState` (names the pagination/slice params excluded from a state's live invalidation channel), and carry live-update `grants` in the SSR hydration payload (`DehydratedState.grants`).
- cb91a66: Replace `QueryCache`'s `getPromise` + `setPromise` pair with a single `getOrStart(key, start)`. The cache now owns the check-and-store atomically — `start` runs only on a cache miss and its promise is registered automatically — so callers can no longer create an in-flight fetch without deduping it.

  Also drop the unused `peek` and `delete` methods from `QueryCache`. Read a query's current value via `getQuery(key).get()` instead of `peek(key)`.

### Patch Changes

- 7be2f77: Republish the 2.0.0 RC line. The `2.0.0-rc.0`/`2.0.0-rc.1` builds of `rxfy` and `rxfy-react` on npm predate the rest of the 2.0.0 release train; `2.0.0-rc.2` is the first RC where all five packages are built from the same source.

## 2.0.0-rc.2

### Patch Changes

- 7be2f77: Republish the 2.0.0 RC line. The `2.0.0-rc.0`/`2.0.0-rc.1` builds of `rxfy` and `rxfy-react` on npm predate the rest of the 2.0.0 release train; `2.0.0-rc.2` is the first RC where all five packages are built from the same source.

## 2.0.0-rc.0

### Minor Changes

- a833885: Add the optional `window` field to `defineState` (names the pagination/slice params excluded from a state's live invalidation channel), and carry live-update `grants` in the SSR hydration payload (`DehydratedState.grants`).
- cb91a66: Replace `QueryCache`'s `getPromise` + `setPromise` pair with a single `getOrStart(key, start)`. The cache now owns the check-and-store atomically — `start` runs only on a cache miss and its promise is registered automatically — so callers can no longer create an in-flight fetch without deduping it.

  Also drop the unused `peek` and `delete` methods from `QueryCache`. Read a query's current value via `getQuery(key).get()` instead of `peek(key)`.

## 1.3.0

### Minor Changes

- 5d75854: `createModel` now takes a single config object instead of two positional arguments.

  The schema has been merged into the options object, matching the config-object shape used elsewhere
  (e.g. `useStateData`). Update call sites from
  `createModel(schema, { getKey, name })` to `createModel({ schema, getKey, name })`.

- 9066c5c: Support plain (non-normalized) value fields in `defineState`.

  `defineState({ model })` now accepts a bare zod schema as a field entry to declare a plain value
  (boolean, primitive, or object). Such fields live in the query state and pass through `data# rxfy
unchanged, distinct from `array()`/`single()` entity fields that normalize into model stores. Plain
  values are validated against their schema in development and passed through in production.

## 1.3.0-rc.0

### Minor Changes

- 5d75854: `createModel` now takes a single config object instead of two positional arguments.

  The schema has been merged into the options object, matching the config-object shape used elsewhere
  (e.g. `useStateData`). Update call sites from
  `createModel(schema, { getKey, name })` to `createModel({ schema, getKey, name })`.

- 9066c5c: Support plain (non-normalized) value fields in `defineState`.

  `defineState({ model })` now accepts a bare zod schema as a field entry to declare a plain value
  (boolean, primitive, or object). Such fields live in the query state and pass through `data# rxfy
unchanged, distinct from `array()`/`single()` entity fields that normalize into model stores. Plain
  values are validated against their schema in development and passed through in production.

## 1.2.1

### Patch Changes

- 72fef24: Rewrite the package README intro to match the docs site

## 1.2.1-rc.0

### Patch Changes

- 72fef24: Rewrite the package README intro to match the docs site

## 1.2.0

### Minor Changes

- de03c5b: `useStateData`'s `setRaw` now accepts denormalized entity objects (or a mix of ids and entities) in model-field slots and normalizes them on write — appending a page no longer needs a manual `normalizeResult` call, and the "entity not loaded" footgun is gone. Object elements are written to their model stores (schema-validated in development); string ids pass through unchanged, so existing id-only `setRaw` calls are unaffected. The updater form still receives `prev` as ids, keeping appends O(page size).

  Adds the `normalizeWritable` helper and the `WritableQueryShapeOf` type to `rxfy`.

## 1.2.0-rc.0

### Minor Changes

- de03c5b: `useStateData`'s `setRaw` now accepts denormalized entity objects (or a mix of ids and entities) in model-field slots and normalizes them on write — appending a page no longer needs a manual `normalizeResult` call, and the "entity not loaded" footgun is gone. Object elements are written to their model stores (schema-validated in development); string ids pass through unchanged, so existing id-only `setRaw` calls are unaffected. The updater form still receives `prev` as ids, keeping appends O(page size).

  Adds the `normalizeWritable` helper and the `WritableQueryShapeOf` type to `rxfy`.

## 1.1.1

## 1.1.1-rc.0

## 1.1.0

### Minor Changes

- e899eaa: Upgrade zod peer dependency to `^4.0.0`. Consumers must upgrade zod to v4.

  Also removes unused production dependencies `p-queue` and `object-hash`.

## 1.1.0-rc.1

### Minor Changes

- e899eaa: Upgrade zod peer dependency to `^4.0.0`. Consumers must upgrade zod to v4.

  Also removes unused production dependencies `p-queue` and `object-hash`.

## 1.1.0-rc.0

### Minor Changes

- e899eaa: Upgrade zod peer dependency to `^4.0.0`. Consumers must upgrade zod to v4.

  Also removes unused production dependencies `p-queue` and `object-hash`.

## 1.0.5

## 1.0.5-rc.0

## 1.0.4

### Patch Changes

- 72c9d7f: Rewrote package READMEs to be minimal and reference-based; added agent skills install instructions and links to documentation, guides, and examples.

## 1.0.4-rc.0

### Patch Changes

- 72c9d7f: Rewrote package READMEs to be minimal and reference-based; added agent skills install instructions and links to documentation, guides, and examples.

## 1.0.3

### Patch Changes

- b6c81a6: Add `modelTopic` and `createSubscriptionManager` for live-update integrations.

  `modelTopic(model, id)` constructs a branded `Topic` string (`name:id`) from a named `ModelDescriptor`, replacing the copy-paste `topic()` helper from the live-updates guide.

  `createSubscriptionManager(send)` is a transport-agnostic subscription reconciler — tracks `desired` vs `active` topic sets and sends only the gap to the server, with `reconnect()` to replay the full desired set after a connection drop.

  Both are exported from the main `rxfy` barrel.

## 1.0.3-rc.0

### Patch Changes

- b6c81a6: Add `modelTopic` and `createSubscriptionManager` for live-update integrations.

  `modelTopic(model, id)` constructs a branded `Topic` string (`name:id`) from a named `ModelDescriptor`, replacing the copy-paste `topic()` helper from the live-updates guide.

  `createSubscriptionManager(send)` is a transport-agnostic subscription reconciler — tracks `desired` vs `active` topic sets and sends only the gap to the server, with `reconnect()` to replay the full desired set after a connection drop.

  Both are exported from the main `rxfy` barrel.

## 1.0.2

### Patch Changes

- 565775e: Add npm `keywords` to package manifests for better discoverability.
- eb8539f: Add MIT license, repository `directory`, and `sideEffects: false` to package manifests; refine `rxfy` exports with per-condition type declarations.

## 1.0.2-rc.1

### Patch Changes

- 565775e: Add npm `keywords` to package manifests for better discoverability.
- eb8539f: Add MIT license, repository `directory`, and `sideEffects: false` to package manifests; refine `rxfy` exports with per-condition type declarations.

## 1.0.2-rc.0

### Patch Changes

- 565775e: Add npm `keywords` to package manifests for better discoverability.
- eb8539f: Add MIT license, repository `directory`, and `sideEffects: false` to package manifests; refine `rxfy` exports with per-condition type declarations.

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
