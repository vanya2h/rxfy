---
"rxfy-server": major
"rxfy-server-drizzle": major
"rxfy-server-memory": major
"rxfy-ws": major
---

Decouple the live server from Drizzle behind a `LiveStorage<TBinding>` port.

`rxfy-server` is now storage-agnostic: `createServer({ db, resources, … })` becomes
`createLive({ storage, … })`, `Resource` is neutral (carries an opaque adapter binding), `Live` is
generic over the binding, and the `rxfy-server/hub` and `rxfy-server/browser` subpaths collapse into
the single Drizzle-free entry. Drizzle ships as **rxfy-server-drizzle** (`defineResource`,
`drizzleStorage`, `DrizzleBinding`) and in-memory as **rxfy-server-memory** (`defineCollection`,
`memoryStorage`, `MemoryBinding`). `rxfy-ws` imports the hub API from the collapsed `rxfy-server`
entry.

Migration: `createServer({ db, resources, hub, secret })` → `createLive({ storage: drizzleStorage(db), hub, secret })`;
import `defineResource` from `rxfy-server-drizzle` (was `rxfy-server/browser`); `createResourceRegistry`
stays in `rxfy-server`.
