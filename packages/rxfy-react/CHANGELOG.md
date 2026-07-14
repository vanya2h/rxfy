# rxfy-react

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

- 7e4415e: New `rxfy-client` package — the framework-agnostic browser half of the sync stack — and a
  terminology change: the real-time "live" surface is now named **sync**.

  `createSyncClient` (formerly `createLiveClient`) moves out of `rxfy-react` into `rxfy-client`;
  `rxfy-react` re-exports it, so React apps still import from `rxfy-react`. Sync updates no longer
  require React. In `rxfy-react`, `StoreProvider`'s `liveClient` prop is now `syncClient` and
  `useLiveClient` is now `useSyncClient`.

  The client takes custody of the signed channel grants the data delivered — each `$grant` lifted by
  `useStateData`, plus the SSR `grants` payload via the new `readSsrGrants()`. It subscribes with them
  over the WebSocket transport, renews them ahead of expiry through an app-mounted endpoint
  (`renewUrl`, which runs the app's own auth), and replays its whole grant set on every reconnect.

  - `rxfy-client`: `createSyncClient({ registry, transport, renewUrl? })`, `readSsrGrants()`.
  - `rxfy-react`: re-exports `createSyncClient` and `readSsrGrants`; `syncClient` prop, `useSyncClient`.
  - **Breaking (rename):** `createLiveClient` → `createSyncClient`, `useLiveClient` → `useSyncClient`,
    `liveClient` prop → `syncClient`, and types `LiveClient` / `LiveClientConfig` / `LiveTransport` →
    `SyncClient` / `SyncClientConfig` / `SyncTransport`.

- 02995d1: `defineState` now requires `key`, and `StateDescriptor.key` is a required `string`. Every state participates in the SSR query cache and derives a live invalidation channel; the keyless opt-out is gone. Keyed descriptors are now directly assignable to key-requiring inputs such as rxfy-server's `StateChannelDescriptor`, so `touch(postsState, params)` works without a cast. `useStateData` drops the keyless code paths (private per-mount query atom and the SSR "cannot be fetched" warning). A `_shape` phantom carrier was added to `StateDescriptor` so `TShape` is structurally inferable from a descriptor value.

  Migration: add a unique `key` to any `defineState` call that omitted one.

### Patch Changes

- Updated dependencies [f4cf59f]
- Updated dependencies [630ab6f]
- Updated dependencies [7e4415e]
  - rxfy-protocol@3.0.0-rc.1
  - rxfy-client@3.0.0-rc.1

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

- 7e4415e: New `rxfy-client` package — the framework-agnostic browser half of the sync stack — and a
  terminology change: the real-time "live" surface is now named **sync**.

  `createSyncClient` (formerly `createLiveClient`) moves out of `rxfy-react` into `rxfy-client`;
  `rxfy-react` re-exports it, so React apps still import from `rxfy-react`. Sync updates no longer
  require React. In `rxfy-react`, `StoreProvider`'s `liveClient` prop is now `syncClient` and
  `useLiveClient` is now `useSyncClient`.

  The client takes custody of the signed channel grants the data delivered — each `$grant` lifted by
  `useStateData`, plus the SSR `grants` payload via the new `readSsrGrants()`. It subscribes with them
  over the WebSocket transport, renews them ahead of expiry through an app-mounted endpoint
  (`renewUrl`, which runs the app's own auth), and replays its whole grant set on every reconnect.

  - `rxfy-client`: `createSyncClient({ registry, transport, renewUrl? })`, `readSsrGrants()`.
  - `rxfy-react`: re-exports `createSyncClient` and `readSsrGrants`; `syncClient` prop, `useSyncClient`.
  - **Breaking (rename):** `createLiveClient` → `createSyncClient`, `useLiveClient` → `useSyncClient`,
    `liveClient` prop → `syncClient`, and types `LiveClient` / `LiveClientConfig` / `LiveTransport` →
    `SyncClient` / `SyncClientConfig` / `SyncTransport`.

- 02995d1: `defineState` now requires `key`, and `StateDescriptor.key` is a required `string`. Every state participates in the SSR query cache and derives a live invalidation channel; the keyless opt-out is gone. Keyed descriptors are now directly assignable to key-requiring inputs such as rxfy-server's `StateChannelDescriptor`, so `touch(postsState, params)` works without a cast. `useStateData` drops the keyless code paths (private per-mount query atom and the SSR "cannot be fetched" warning). A `_shape` phantom carrier was added to `StateDescriptor` so `TShape` is structurally inferable from a descriptor value.

  Migration: add a unique `key` to any `defineState` call that omitted one.

### Patch Changes

- Updated dependencies [f4cf59f]
- Updated dependencies [630ab6f]
- Updated dependencies [7e4415e]
  - rxfy-protocol@3.0.0-rc.0
  - rxfy-client@3.0.0-rc.0

## 2.0.0

### Minor Changes

- a833885: Add the client live layer: `createSyncClient` (applies inbound entity patches to stores and counts per-state "updates available" signals), `stateChannel`, `readSsrGrants`, `StoreProvider`'s `syncClient` prop + `useSyncClient`, and `useStateData`'s `updatesAvailable# rxfy-react / `applyUpdates()`.

### Patch Changes

- 7be2f77: Republish the 2.0.0 RC line. The `2.0.0-rc.0`/`2.0.0-rc.1` builds of `rxfy` and `rxfy-react` on npm predate the rest of the 2.0.0 release train; `2.0.0-rc.2` is the first RC where all five packages are built from the same source.
- Updated dependencies [5029f3c]
  - rxfy-protocol@2.0.0

## 2.0.0-rc.2

### Patch Changes

- 7be2f77: Republish the 2.0.0 RC line. The `2.0.0-rc.0`/`2.0.0-rc.1` builds of `rxfy` and `rxfy-react` on npm predate the rest of the 2.0.0 release train; `2.0.0-rc.2` is the first RC where all five packages are built from the same source.
  - rxfy-protocol@2.0.0-rc.2

## 2.0.0-rc.0

### Minor Changes

- a833885: Add the client live layer: `createSyncClient` (applies inbound entity patches to stores and counts per-state "updates available" signals), `stateChannel`, `readSsrGrants`, `StoreProvider`'s `syncClient` prop + `useSyncClient`, and `useStateData`'s `updatesAvailable# rxfy-react / `applyUpdates()`.

### Patch Changes

- Updated dependencies [5029f3c]
  - rxfy-protocol@2.0.0-rc.0

## 1.3.0

### Minor Changes

- 5d75854: `createModel` now takes a single config object instead of two positional arguments.

  The schema has been merged into the options object, matching the config-object shape used elsewhere
  (e.g. `useStateData`). Update call sites from
  `createModel(schema, { getKey, name })` to `createModel({ schema, getKey, name })`.

- 9066c5c: Support plain (non-normalized) value fields in `defineState`.

  `defineState({ model })` now accepts a bare zod schema as a field entry to declare a plain value
  (boolean, primitive, or object). Such fields live in the query state and pass through `data# rxfy-react
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
  (boolean, primitive, or object). Such fields live in the query state and pass through `data# rxfy-react
unchanged, distinct from `array()`/`single()` entity fields that normalize into model stores. Plain
  values are validated against their schema in development and passed through in production.

## 1.2.1

## 1.2.1-rc.0

## 1.2.0

### Minor Changes

- de03c5b: `useStateData`'s `setRaw` now accepts denormalized entity objects (or a mix of ids and entities) in model-field slots and normalizes them on write — appending a page no longer needs a manual `normalizeResult` call, and the "entity not loaded" footgun is gone. Object elements are written to their model stores (schema-validated in development); string ids pass through unchanged, so existing id-only `setRaw` calls are unaffected. The updater form still receives `prev` as ids, keeping appends O(page size).

  Adds the `normalizeWritable` helper and the `WritableQueryShapeOf` type to `rxfy`.

- ea6840c: **Breaking:** `useStateData` now takes a single config object instead of positional arguments. Replace `useStateData(state, fetchFn, params, { defaultData })` with `useStateData({ state, fetchFn, params, defaultData })`. This matches the shape of `useStatePagedData` and makes the optional `defaultData` a flat field rather than a separate options argument.

  Also exports the `UseStateDataConfig` and `Updater<T>` types. `Updater<T>` (`T | ((prev: T) => T)`) is the `useState`-style setter union used by `set` and `setRaw`.

  Reworks the internals for a stabler `data# rxfy-react:

  - **`reload()` refetches in place.** It now flips the shared query atom to PENDING and refetches into it, instead of deleting the cache entry and rebuilding the handle. Every component subscribed to the same keyed state sees the refreshed result (previously only the caller did — others were stranded on stale data), and `data# rxfy-react keeps a stable identity across a reload (a FULFILLED → reload no longer flashes a new subscription; it revalidates in place). A reload recovering from a REJECTED state still resubscribes, since an Rx error is terminal.
  - **`data# rxfy-react identity is stable** across re-renders, a changing `defaultData`, and an identity-unstable-but-value-equal `params` (the query is now keyed by the params _value_). `defaultData` changes never reset the stream — only the first load reads it.
  - **`set` / `setRaw` abort any in-flight fetch** before committing FULFILLED, so an explicit write can't be clobbered by a late-arriving fetch result.

  `useStatePagedData.reload()` resets its own pagination state to match the new in-place reload semantics.

- 209cd87: Add `useStatePagedData` — a focused hook for paginated / infinite-scroll lists of a single entity type. You give it a `model` (the list is always `array(model)`) and a `key`; `data# rxfy-react emits a flat `string[]`of ids. Page 0 is SSR'd and hydrated through`useStateData`; `loadMore()`fetches and appends later pages via a pluggable`getCursor`and`select`, with built-in `isLoading`and`hasMore`. Appending is O(page size) — only the new page's entities are written, never the whole list.

  Also adds `setRaw` to `StateHandle`: a low-level sibling of `set` that writes the normalized id shape directly (no normalize/denormalize round-trip), for append / prepend / reorder / dedup without re-normalizing the full list.

## 1.2.0-rc.0

### Minor Changes

- de03c5b: `useStateData`'s `setRaw` now accepts denormalized entity objects (or a mix of ids and entities) in model-field slots and normalizes them on write — appending a page no longer needs a manual `normalizeResult` call, and the "entity not loaded" footgun is gone. Object elements are written to their model stores (schema-validated in development); string ids pass through unchanged, so existing id-only `setRaw` calls are unaffected. The updater form still receives `prev` as ids, keeping appends O(page size).

  Adds the `normalizeWritable` helper and the `WritableQueryShapeOf` type to `rxfy`.

- ea6840c: **Breaking:** `useStateData` now takes a single config object instead of positional arguments. Replace `useStateData(state, fetchFn, params, { defaultData })` with `useStateData({ state, fetchFn, params, defaultData })`. This matches the shape of `useStatePagedData` and makes the optional `defaultData` a flat field rather than a separate options argument.

  Also exports the `UseStateDataConfig` and `Updater<T>` types. `Updater<T>` (`T | ((prev: T) => T)`) is the `useState`-style setter union used by `set` and `setRaw`.

  Reworks the internals for a stabler `data# rxfy-react:

  - **`reload()` refetches in place.** It now flips the shared query atom to PENDING and refetches into it, instead of deleting the cache entry and rebuilding the handle. Every component subscribed to the same keyed state sees the refreshed result (previously only the caller did — others were stranded on stale data), and `data# rxfy-react keeps a stable identity across a reload (a FULFILLED → reload no longer flashes a new subscription; it revalidates in place). A reload recovering from a REJECTED state still resubscribes, since an Rx error is terminal.
  - **`data# rxfy-react identity is stable** across re-renders, a changing `defaultData`, and an identity-unstable-but-value-equal `params` (the query is now keyed by the params _value_). `defaultData` changes never reset the stream — only the first load reads it.
  - **`set` / `setRaw` abort any in-flight fetch** before committing FULFILLED, so an explicit write can't be clobbered by a late-arriving fetch result.

  `useStatePagedData.reload()` resets its own pagination state to match the new in-place reload semantics.

- 209cd87: Add `useStatePagedData` — a focused hook for paginated / infinite-scroll lists of a single entity type. You give it a `model` (the list is always `array(model)`) and a `key`; `data# rxfy-react emits a flat `string[]`of ids. Page 0 is SSR'd and hydrated through`useStateData`; `loadMore()`fetches and appends later pages via a pluggable`getCursor`and`select`, with built-in `isLoading`and`hasMore`. Appending is O(page size) — only the new page's entities are written, never the whole list.

  Also adds `setRaw` to `StateHandle`: a low-level sibling of `set` that writes the normalized id shape directly (no normalize/denormalize round-trip), for append / prepend / reorder / dedup without re-normalizing the full list.

## 1.1.1

### Patch Changes

- d76ceef: Fix `useStateData` latching a spurious `REJECTED` (and surfacing an `AbortError`) when a
  component unmounts before its initial fetch settles — most visibly under React StrictMode,
  where the synchronous mount→unmount→mount aborted the in-flight fetch and the remount never
  refetched. The client fetch is now multicast with a deferred ref-count reset, so an immediate
  re-subscription keeps the request alive, and abort-driven rejections no longer write into the
  shared query atom.

## 1.1.1-rc.0

### Patch Changes

- d76ceef: Fix `useStateData` latching a spurious `REJECTED` (and surfacing an `AbortError`) when a
  component unmounts before its initial fetch settles — most visibly under React StrictMode,
  where the synchronous mount→unmount→mount aborted the in-flight fetch and the remount never
  refetched. The client fetch is now multicast with a deferred ref-count reset, so an immediate
  re-subscription keeps the request alive, and abort-driven rejections no longer write into the
  shared query atom.

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

### Patch Changes

- ec4af29: Add `defaultData` option to `useStateData` — seeds the state from pre-fetched data (e.g. a react-router loader) without triggering a fetch on first load.
  - rxfy@1.0.5

## 1.0.5-rc.0

### Patch Changes

- ec4af29: Add `defaultData` option to `useStateData` — seeds the state from pre-fetched data (e.g. a react-router loader) without triggering a fetch on first load.
  - rxfy@1.0.5-rc.0

## 1.0.4

### Patch Changes

- 72c9d7f: Rewrote package READMEs to be minimal and reference-based; added agent skills install instructions and links to documentation, guides, and examples.
- Updated dependencies [72c9d7f]
  - rxfy@1.0.4

## 1.0.4-rc.0

### Patch Changes

- 72c9d7f: Rewrote package READMEs to be minimal and reference-based; added agent skills install instructions and links to documentation, guides, and examples.
- Updated dependencies [72c9d7f]
  - rxfy@1.0.4-rc.0

## 1.0.3

### Patch Changes

- b6c81a6: Add `modelTopic` and `createSubscriptionManager` for live-update integrations.

  `modelTopic(model, id)` constructs a branded `Topic` string (`name:id`) from a named `ModelDescriptor`, replacing the copy-paste `topic()` helper from the live-updates guide.

  `createSubscriptionManager(send)` is a transport-agnostic subscription reconciler — tracks `desired` vs `active` topic sets and sends only the gap to the server, with `reconnect()` to replay the full desired set after a connection drop.

  Both are exported from the main `rxfy` barrel.

- Updated dependencies [b6c81a6]
  - rxfy@1.0.3

## 1.0.3-rc.0

### Patch Changes

- b6c81a6: Add `modelTopic` and `createSubscriptionManager` for live-update integrations.

  `modelTopic(model, id)` constructs a branded `Topic` string (`name:id`) from a named `ModelDescriptor`, replacing the copy-paste `topic()` helper from the live-updates guide.

  `createSubscriptionManager(send)` is a transport-agnostic subscription reconciler — tracks `desired` vs `active` topic sets and sends only the gap to the server, with `reconnect()` to replay the full desired set after a connection drop.

  Both are exported from the main `rxfy` barrel.

- Updated dependencies [b6c81a6]
  - rxfy@1.0.3-rc.0

## 1.0.2

### Patch Changes

- 565775e: Add npm `keywords` to package manifests for better discoverability.
- eb8539f: Add MIT license, repository `directory`, and `sideEffects: false` to package manifests; refine `rxfy` exports with per-condition type declarations.
- Updated dependencies [565775e]
- Updated dependencies [eb8539f]
  - rxfy@1.0.2

## 1.0.2-rc.1

### Patch Changes

- 565775e: Add npm `keywords` to package manifests for better discoverability.
- eb8539f: Add MIT license, repository `directory`, and `sideEffects: false` to package manifests; refine `rxfy` exports with per-condition type declarations.
- Updated dependencies [565775e]
- Updated dependencies [eb8539f]
  - rxfy@1.0.2-rc.1

## 1.0.2-rc.0

### Patch Changes

- 565775e: Add npm `keywords` to package manifests for better discoverability.
- eb8539f: Add MIT license, repository `directory`, and `sideEffects: false` to package manifests; refine `rxfy` exports with per-condition type declarations.
- Updated dependencies [565775e]
- Updated dependencies [eb8539f]
  - rxfy@1.0.2-rc.0

## 1.0.1

### Patch Changes

- 9385b4e: Point package `homepage` at the documentation website (https://rxfy.vanya2h.me) and add documentation links to the READMEs.
- Updated dependencies [9385b4e]
  - rxfy@1.0.1

## 1.0.0

### Major Changes

- 86fe0fa: First stable 1.0 release. Promotes `rxfy` and `rxfy-react` to a stable major now that the Atom/Lens/Wrapped data layer, normalized Model/State stores, and SSR support have settled into their public API.

### Minor Changes

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
  - `useObservable` skips notifications for deep-equal emissions, preventing re-render loops; `usePending` documents that `source# rxfy-react must be referentially stable.

  BREAKING: `data# rxfy-react now emits normalized query state — entity **ids** (`string`/`string[]`) instead of full entities. Read entity data through model stores (`useModelStore(model).get(id)`). Mutation reducers and `set()`are unchanged: they still operate on full entities; rxfy denormalizes the current ids into fresh entities before running your reducer and re-normalizes the result, so the manual`store.set(...)` + mutation two-step is no longer needed.

### Patch Changes

- Updated dependencies [70b8691]
- Updated dependencies [18812a9]
- Updated dependencies [d49cc70]
- Updated dependencies [5c06619]
- Updated dependencies [ddacc0c]
- Updated dependencies [86fe0fa]
  - rxfy@1.0.0

## 1.0.0-rc.1

### Major Changes

- 86fe0fa: First stable 1.0 release. Promotes `rxfy` and `rxfy-react` to a stable major now that the Atom/Lens/Wrapped data layer, normalized Model/State stores, and SSR support have settled into their public API.

### Minor Changes

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
  - `useObservable` skips notifications for deep-equal emissions, preventing re-render loops; `usePending` documents that `source# rxfy-react must be referentially stable.

  BREAKING: `data# rxfy-react now emits normalized query state — entity **ids** (`string`/`string[]`) instead of full entities. Read entity data through model stores (`useModelStore(model).get(id)`). Mutation reducers and `set()`are unchanged: they still operate on full entities; rxfy denormalizes the current ids into fresh entities before running your reducer and re-normalizes the result, so the manual`store.set(...)` + mutation two-step is no longer needed.

### Patch Changes

- Updated dependencies [70b8691]
- Updated dependencies [18812a9]
- Updated dependencies [d49cc70]
- Updated dependencies [5c06619]
- Updated dependencies [ddacc0c]
- Updated dependencies [86fe0fa]
  - rxfy@1.0.0-rc.1

## 1.0.0-rc.0

### Major Changes

- 86fe0fa: First stable 1.0 release. Promotes `rxfy` and `rxfy-react` to a stable major now that the Atom/Lens/Wrapped data layer, normalized Model/State stores, and SSR support have settled into their public API.

### Minor Changes

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

### Patch Changes

- Updated dependencies [70b8691]
- Updated dependencies [18812a9]
- Updated dependencies [d49cc70]
- Updated dependencies [5c06619]
- Updated dependencies [ddacc0c]
- Updated dependencies [86fe0fa]
  - rxfy@1.0.0-rc.0
