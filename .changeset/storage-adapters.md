---
"rxfy-server": major
"rxfy-server-drizzle": major
"rxfy-server-memory": major
"rxfy-ws": major
---

Decouple the sync server from Drizzle behind a `SyncStorage<TBinding>` port, and rename the
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
