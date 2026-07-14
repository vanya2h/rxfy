# rxfy-server-drizzle

[Drizzle](https://orm.drizzle.team)/Postgres storage adapter for [rxfy-server](https://rxfy.vanya2h.me/framework/server). Binds Drizzle tables to rxfy models and persists the live server's writes.

## Install

```bash
npm install rxfy-server-drizzle
# peer deps: rxfy rxfy-server drizzle-orm drizzle-zod zod
```

## What it gives you

- `defineResource({ table, name?, model? })` — bind a Drizzle table to an rxfy model (derived via drizzle-zod, or pass a `model` shared with client code). Returns a storage-neutral `Resource` carrying a Drizzle binding, safe to import into client bundles.
- `drizzleStorage(db)` — a `LiveStorage` that runs `create` / `update` / `delete` against the bound tables. Pass it to `createLive`.
- `DrizzleBinding` — the resource binding type (`{ table, pkColumn }`).

```ts
import { createInMemoryHub, createLive } from "rxfy-server";
import { defineResource, drizzleStorage } from "rxfy-server-drizzle";

const posts = defineResource({ table: postsTable });
const live = createLive({ storage: drizzleStorage(db), hub: createInMemoryHub(), secret });

await live.update(posts, id, { title }); // writes the row and publishes a patch
```

See the [rxfy-server docs](https://rxfy.vanya2h.me/framework/server) for the full walkthrough, and [Storage adapters](https://rxfy.vanya2h.me/framework/server/storage-adapters) for how this adapter plugs in.
