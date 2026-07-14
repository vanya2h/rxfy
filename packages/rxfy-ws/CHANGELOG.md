# rxfy-ws

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

### Patch Changes

- Updated dependencies [f4cf59f]
- Updated dependencies [9984591]
- Updated dependencies [9984591]
- Updated dependencies [630ab6f]
- Updated dependencies [9984591]
- Updated dependencies [44d5896]
- Updated dependencies [9984591]
- Updated dependencies [9984591]
  - rxfy-protocol@3.0.0
  - rxfy-server@3.0.0

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

### Patch Changes

- Updated dependencies [f4cf59f]
- Updated dependencies [9984591]
- Updated dependencies [9984591]
- Updated dependencies [630ab6f]
- Updated dependencies [9984591]
- Updated dependencies [44d5896]
- Updated dependencies [9984591]
- Updated dependencies [9984591]
  - rxfy-protocol@3.0.0-rc.1
  - rxfy-server@3.0.0-rc.1

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

### Patch Changes

- Updated dependencies [f4cf59f]
- Updated dependencies [9984591]
- Updated dependencies [9984591]
- Updated dependencies [630ab6f]
- Updated dependencies [9984591]
- Updated dependencies [44d5896]
- Updated dependencies [9984591]
- Updated dependencies [9984591]
  - rxfy-protocol@3.0.0-rc.0
  - rxfy-server@3.0.0-rc.0

## 2.0.0

### Minor Changes

- 8fd2b9c: Add `rxfy-ws`: the default WebSocket transport. `createWsServer(hub)` bridges the rxfy-server hub to sockets; `rxfy-ws/client`'s `createWsClient` is a cross-platform client transport (subscribe/unsubscribe + inbound messages, with reconnect and subscription replay).

### Patch Changes

- Updated dependencies [5029f3c]
- Updated dependencies [1c4f9d1]
- Updated dependencies [ed5c8f9]
- Updated dependencies [cc14664]
- Updated dependencies [8ff4fad]
- Updated dependencies [be0b2b9]
  - rxfy-protocol@2.0.0
  - rxfy-server@2.0.0

## 2.0.0-rc.2

### Patch Changes

- rxfy-server@2.0.0-rc.2
- rxfy-protocol@2.0.0-rc.2

## 2.0.0-rc.0

### Minor Changes

- 8fd2b9c: Add `rxfy-ws`: the default WebSocket transport. `createWsServer(hub)` bridges the rxfy-server hub to sockets; `rxfy-ws/client`'s `createWsClient` is a cross-platform client transport (subscribe/unsubscribe + inbound messages, with reconnect and subscription replay).

### Patch Changes

- Updated dependencies [5029f3c]
- Updated dependencies [1c4f9d1]
- Updated dependencies [ed5c8f9]
- Updated dependencies [cc14664]
- Updated dependencies [8ff4fad]
- Updated dependencies [be0b2b9]
  - rxfy-protocol@2.0.0-rc.0
  - rxfy-server@2.0.0-rc.0
