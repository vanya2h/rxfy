# rxfy-server

## 3.0.0

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

- 9984591: `live.serve(state, params, data)` now accepts the state's _input_ shape and parses it through the field schemas instead of passing data through untouched. Raw DB rows — unbranded ids, extra columns like `createdAt` — go in with no casts; the returned payload has ids branded and unknown keys stripped. This changes `serve`'s behavior: the result is a new parsed object (not the same reference), and invalid data now throws.

  To support this, rxfy threads the zod Input type through the descriptors: `ModelDescriptor`, `FieldDescriptor`, and `StateDescriptor` gain a trailing input type parameter (defaulted, non-breaking), `defineState` derives it via the new `InputShapeFromFields`, and the new `parseShape(fields, input)` helper performs the parse.

- 44d5896: Decouple the sync server from Drizzle behind a `SyncStorage<TBinding>` port, and rename the
  server-side "live" surface to **sync**: `createLive` → `createSync`, type `Live` → `Sync`,
  `LiveConfig` → `SyncConfig`, `LiveStorage` → `SyncStorage`.

  `rxfy-server` is now storage-agnostic: `createServer({ db, resources, … })` becomes
  `createSync({ storage, … })`, `Resource` is neutral (carries an opaque adapter binding), `Sync` is
  generic over the binding, and the `rxfy-server/hub` and `rxfy-server/browser` subpaths collapse into
  the single Drizzle-free entry. Drizzle ships as **rxfy-server-drizzle** (`defineResource`,
  `drizzleStorage`, `DrizzleBinding`) and in-memory as **rxfy-server-memory** (`defineCollection`,
  `memoryStorage`, `MemoryBinding`). `rxfy-ws` imports the hub API from the collapsed `rxfy-server`
  entry.

  Migration: `createServer({ db, resources, hub, secret })` → `createSync({ storage: drizzleStorage(db), hub, secret })`;
  import `defineResource` from `rxfy-server-drizzle` (was `rxfy-server/browser`); `createResourceRegistry`
  stays in `rxfy-server`.

- 9984591: Writer signatures tightened. `Live.update`/`Live.create` infer the resource's `TRow` instead of erasing it with `Resource<TTable, any>`, so resources carrying an injected (branded / narrower) model fit as before. `Live.create` no longer types `undefined` in its result — a plain insert always returns the row (a zero-row `.returning()` now throws). `Live.update` resolving `undefined` is now the documented not-found contract, and a not-found update no longer publishes its `touch` targets.

### Minor Changes

- 9984591: New `grantsHydration(registry, { secret, ttlMs? })` helper, exported from `rxfy-server/hub`: the one-call SSR payload for apps on the bare hub (no `createServer`) — signs a channel grant for each channel the render logged into the registry and returns the hydration script with the `grants` embedded. `live.hydration` now wraps it. The client lifts the grants (`readSsrGrants`) and subscribes; entity topics ride the client's first subscribe frame, derived from the hydrated stores.
- 9984591: New drizzle-free `rxfy-server/hub` subpath exporting the socket-keyed in-memory hub, subscription-id helpers (`entitySubscription`/`channelSubscription`/`entityTopicSubscription`), channel derivation (`touch`/`invalidationChannel`/`StateChannelDescriptor`), the grant primitives (`signGrant`/`verifyGrant`), and the one-call SSR helper `grantsHydration(registry, { secret })` (signs a grant per channel the render logged and returns the hydration script — `live.hydration` now wraps it). Apps that only need stale-notification plumbing — e.g. an in-memory store publishing `stale` on writes — can now wire live updates without installing the Drizzle peer dependencies behind the main entry. `touch`/`TouchTarget` moved to the state-channel module and the subscription-id helpers to the hub module (still re-exported from the main entry — no import changes needed).

### Patch Changes

- 9984591: `live.create` and `live.update` now accept `Resource<TTable, any>` instead of pinning `TRow` to the table's raw select model. Writers never touch `TRow` — values and the returned row are typed from the table — so resources carrying an injected model (branded ids, narrower row) no longer need an `as unknown as Resource<typeof table>` cast.
- Updated dependencies [f4cf59f]
- Updated dependencies [630ab6f]
  - rxfy-protocol@3.0.0

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

- 9984591: `live.serve(state, params, data)` now accepts the state's _input_ shape and parses it through the field schemas instead of passing data through untouched. Raw DB rows — unbranded ids, extra columns like `createdAt` — go in with no casts; the returned payload has ids branded and unknown keys stripped. This changes `serve`'s behavior: the result is a new parsed object (not the same reference), and invalid data now throws.

  To support this, rxfy threads the zod Input type through the descriptors: `ModelDescriptor`, `FieldDescriptor`, and `StateDescriptor` gain a trailing input type parameter (defaulted, non-breaking), `defineState` derives it via the new `InputShapeFromFields`, and the new `parseShape(fields, input)` helper performs the parse.

- 44d5896: Decouple the sync server from Drizzle behind a `SyncStorage<TBinding>` port, and rename the
  server-side "live" surface to **sync**: `createLive` → `createSync`, type `Live` → `Sync`,
  `LiveConfig` → `SyncConfig`, `LiveStorage` → `SyncStorage`.

  `rxfy-server` is now storage-agnostic: `createServer({ db, resources, … })` becomes
  `createSync({ storage, … })`, `Resource` is neutral (carries an opaque adapter binding), `Sync` is
  generic over the binding, and the `rxfy-server/hub` and `rxfy-server/browser` subpaths collapse into
  the single Drizzle-free entry. Drizzle ships as **rxfy-server-drizzle** (`defineResource`,
  `drizzleStorage`, `DrizzleBinding`) and in-memory as **rxfy-server-memory** (`defineCollection`,
  `memoryStorage`, `MemoryBinding`). `rxfy-ws` imports the hub API from the collapsed `rxfy-server`
  entry.

  Migration: `createServer({ db, resources, hub, secret })` → `createSync({ storage: drizzleStorage(db), hub, secret })`;
  import `defineResource` from `rxfy-server-drizzle` (was `rxfy-server/browser`); `createResourceRegistry`
  stays in `rxfy-server`.

- 9984591: Writer signatures tightened. `Live.update`/`Live.create` infer the resource's `TRow` instead of erasing it with `Resource<TTable, any>`, so resources carrying an injected (branded / narrower) model fit as before. `Live.create` no longer types `undefined` in its result — a plain insert always returns the row (a zero-row `.returning()` now throws). `Live.update` resolving `undefined` is now the documented not-found contract, and a not-found update no longer publishes its `touch` targets.

### Minor Changes

- 9984591: New `grantsHydration(registry, { secret, ttlMs? })` helper, exported from `rxfy-server/hub`: the one-call SSR payload for apps on the bare hub (no `createServer`) — signs a channel grant for each channel the render logged into the registry and returns the hydration script with the `grants` embedded. `live.hydration` now wraps it. The client lifts the grants (`readSsrGrants`) and subscribes; entity topics ride the client's first subscribe frame, derived from the hydrated stores.
- 9984591: New drizzle-free `rxfy-server/hub` subpath exporting the socket-keyed in-memory hub, subscription-id helpers (`entitySubscription`/`channelSubscription`/`entityTopicSubscription`), channel derivation (`touch`/`invalidationChannel`/`StateChannelDescriptor`), the grant primitives (`signGrant`/`verifyGrant`), and the one-call SSR helper `grantsHydration(registry, { secret })` (signs a grant per channel the render logged and returns the hydration script — `live.hydration` now wraps it). Apps that only need stale-notification plumbing — e.g. an in-memory store publishing `stale` on writes — can now wire live updates without installing the Drizzle peer dependencies behind the main entry. `touch`/`TouchTarget` moved to the state-channel module and the subscription-id helpers to the hub module (still re-exported from the main entry — no import changes needed).

### Patch Changes

- 9984591: `live.create` and `live.update` now accept `Resource<TTable, any>` instead of pinning `TRow` to the table's raw select model. Writers never touch `TRow` — values and the returned row are typed from the table — so resources carrying an injected model (branded ids, narrower row) no longer need an `as unknown as Resource<typeof table>` cast.
- Updated dependencies [f4cf59f]
- Updated dependencies [630ab6f]
  - rxfy-protocol@3.0.0-rc.1

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

- 9984591: `live.serve(state, params, data)` now accepts the state's _input_ shape and parses it through the field schemas instead of passing data through untouched. Raw DB rows — unbranded ids, extra columns like `createdAt` — go in with no casts; the returned payload has ids branded and unknown keys stripped. This changes `serve`'s behavior: the result is a new parsed object (not the same reference), and invalid data now throws.

  To support this, rxfy threads the zod Input type through the descriptors: `ModelDescriptor`, `FieldDescriptor`, and `StateDescriptor` gain a trailing input type parameter (defaulted, non-breaking), `defineState` derives it via the new `InputShapeFromFields`, and the new `parseShape(fields, input)` helper performs the parse.

- 44d5896: Decouple the sync server from Drizzle behind a `SyncStorage<TBinding>` port, and rename the
  server-side "live" surface to **sync**: `createLive` → `createSync`, type `Live` → `Sync`,
  `LiveConfig` → `SyncConfig`, `LiveStorage` → `SyncStorage`.

  `rxfy-server` is now storage-agnostic: `createServer({ db, resources, … })` becomes
  `createSync({ storage, … })`, `Resource` is neutral (carries an opaque adapter binding), `Sync` is
  generic over the binding, and the `rxfy-server/hub` and `rxfy-server/browser` subpaths collapse into
  the single Drizzle-free entry. Drizzle ships as **rxfy-server-drizzle** (`defineResource`,
  `drizzleStorage`, `DrizzleBinding`) and in-memory as **rxfy-server-memory** (`defineCollection`,
  `memoryStorage`, `MemoryBinding`). `rxfy-ws` imports the hub API from the collapsed `rxfy-server`
  entry.

  Migration: `createServer({ db, resources, hub, secret })` → `createSync({ storage: drizzleStorage(db), hub, secret })`;
  import `defineResource` from `rxfy-server-drizzle` (was `rxfy-server/browser`); `createResourceRegistry`
  stays in `rxfy-server`.

- 9984591: Writer signatures tightened. `Live.update`/`Live.create` infer the resource's `TRow` instead of erasing it with `Resource<TTable, any>`, so resources carrying an injected (branded / narrower) model fit as before. `Live.create` no longer types `undefined` in its result — a plain insert always returns the row (a zero-row `.returning()` now throws). `Live.update` resolving `undefined` is now the documented not-found contract, and a not-found update no longer publishes its `touch` targets.

### Minor Changes

- 9984591: New `grantsHydration(registry, { secret, ttlMs? })` helper, exported from `rxfy-server/hub`: the one-call SSR payload for apps on the bare hub (no `createServer`) — signs a channel grant for each channel the render logged into the registry and returns the hydration script with the `grants` embedded. `live.hydration` now wraps it. The client lifts the grants (`readSsrGrants`) and subscribes; entity topics ride the client's first subscribe frame, derived from the hydrated stores.
- 9984591: New drizzle-free `rxfy-server/hub` subpath exporting the socket-keyed in-memory hub, subscription-id helpers (`entitySubscription`/`channelSubscription`/`entityTopicSubscription`), channel derivation (`touch`/`invalidationChannel`/`StateChannelDescriptor`), the grant primitives (`signGrant`/`verifyGrant`), and the one-call SSR helper `grantsHydration(registry, { secret })` (signs a grant per channel the render logged and returns the hydration script — `live.hydration` now wraps it). Apps that only need stale-notification plumbing — e.g. an in-memory store publishing `stale` on writes — can now wire live updates without installing the Drizzle peer dependencies behind the main entry. `touch`/`TouchTarget` moved to the state-channel module and the subscription-id helpers to the hub module (still re-exported from the main entry — no import changes needed).

### Patch Changes

- 9984591: `live.create` and `live.update` now accept `Resource<TTable, any>` instead of pinning `TRow` to the table's raw select model. Writers never touch `TRow` — values and the returned row are typed from the table — so resources carrying an injected model (branded ids, narrower row) no longer need an `as unknown as Resource<typeof table>` cast.
- Updated dependencies [f4cf59f]
- Updated dependencies [630ab6f]
- Updated dependencies [02995d1]
- Updated dependencies [9984591]
- Updated dependencies [02995d1]
- Updated dependencies [02995d1]
- Updated dependencies [02995d1]
- Updated dependencies [02995d1]
  - rxfy@3.0.0-rc.0
  - rxfy-protocol@3.0.0-rc.0

## 2.0.0

### Minor Changes

- 1c4f9d1: Add the `rxfy-server/browser` subpath exporting the browser-safe resource API (`defineResource`, `createResourceRegistry`, `invalidationChannel` + types) without the Node-only `node:crypto` topic keyer — so `defineResource` can be imported into client bundles.
- ed5c8f9: Add `rxfy-server` foundation: `createTopicKeyer` (windowed HMAC topic-id derivation for capability-based live-update auth) and `invalidationChannel` (window/partition-aware state channel derivation).
- cc14664: `defineResource` now accepts an optional pre-made `model` (`defineResource({ table, model })`), binding a Drizzle table to an existing rxfy `ModelDescriptor` instead of deriving one — so a sync resource can share a model with client code. The resource row type follows the injected model (the table may carry extra columns the model omits).
- 8ff4fad: Add `defineResource` (derive an rxfy model + Zod schema + key extractor from a Drizzle table, no codegen) and `createResourceRegistry` (index resources by name).
- be0b2b9: Add the server core: `createInMemoryHub` (pub/sub), `createServer` write functions (`update`/`create`/`delete`/`touch`) that persist via Drizzle and broadcast over the hub, and `grant` (mint hashed topic ids for a response's entities and state channels).

### Patch Changes

- Updated dependencies [5029f3c]
  - rxfy-protocol@2.0.0

## 2.0.0-rc.2

### Patch Changes

- rxfy-protocol@2.0.0-rc.2

## 2.0.0-rc.0

### Minor Changes

- 1c4f9d1: Add the `rxfy-server/browser` subpath exporting the browser-safe resource API (`defineResource`, `createResourceRegistry`, `invalidationChannel` + types) without the Node-only `node:crypto` topic keyer — so `defineResource` can be imported into client bundles.
- ed5c8f9: Add `rxfy-server` foundation: `createTopicKeyer` (windowed HMAC topic-id derivation for capability-based live-update auth) and `invalidationChannel` (window/partition-aware state channel derivation).
- cc14664: `defineResource` now accepts an optional pre-made `model` (`defineResource({ table, model })`), binding a Drizzle table to an existing rxfy `ModelDescriptor` instead of deriving one — so a sync resource can share a model with client code. The resource row type follows the injected model (the table may carry extra columns the model omits).
- 8ff4fad: Add `defineResource` (derive an rxfy model + Zod schema + key extractor from a Drizzle table, no codegen) and `createResourceRegistry` (index resources by name).
- be0b2b9: Add the server core: `createInMemoryHub` (pub/sub), `createServer` write functions (`update`/`create`/`delete`/`touch`) that persist via Drizzle and broadcast over the hub, and `grant` (mint hashed topic ids for a response's entities and state channels).

### Patch Changes

- Updated dependencies [a833885]
- Updated dependencies [5029f3c]
- Updated dependencies [cb91a66]
  - rxfy@2.0.0-rc.0
  - rxfy-protocol@2.0.0-rc.0
