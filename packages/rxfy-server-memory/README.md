# rxfy-server-memory

In-memory storage adapter for [rxfy-server](https://rxfy.vanya2h.me/framework/server). Zero dependencies — each collection's `Map` is both the write target and the read source, so a demo or test app needs no database.

## Install

```bash
npm install rxfy-server-memory
# peer deps: rxfy rxfy-server
```

## What it gives you

- `defineCollection({ name, model, seed? })` — an in-memory collection: a `Resource` whose binding is its data `Map`, plus `.all()` / `.get(id)` reads for serving.
- `memoryStorage()` — a `LiveStorage` over those collections. Pass it to `createLive`.
- `MemoryBinding` — the resource binding type (`{ rows, getKey }`).

```ts
import { createInMemoryHub, createLive } from "rxfy-server";
import { defineCollection, memoryStorage } from "rxfy-server-memory";

const posts = defineCollection({ name: "post", model: postModel, seed: [] });
const live = createLive({ storage: memoryStorage(), hub: createInMemoryHub(), secret });

await live.create(posts, { id, title }); // stores the row and publishes a patch
```

See the [rxfy-server docs](https://rxfy.vanya2h.me/framework/server) for the full walkthrough.
