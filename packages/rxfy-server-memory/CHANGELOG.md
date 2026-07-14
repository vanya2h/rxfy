# rxfy-server-memory

## 3.0.0-rc.1

### Major Changes

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
  - rxfy-server@3.0.0-rc.1

## 1.0.0-rc.0

### Major Changes

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
- Updated dependencies [02995d1]
- Updated dependencies [9984591]
- Updated dependencies [02995d1]
- Updated dependencies [44d5896]
- Updated dependencies [02995d1]
- Updated dependencies [9984591]
- Updated dependencies [02995d1]
- Updated dependencies [02995d1]
- Updated dependencies [9984591]
  - rxfy@3.0.0-rc.0
  - rxfy-server@3.0.0-rc.0
