# rxfy-server

Binds Drizzle ORM tables to rxfy models, runs database writes through the server, and publishes live update messages via a hub. Server-side only; `rxfy-server/browser` re-exports the client-safe subset (`defineResource`, `createResourceRegistry`) for shared code.

## defineResource

`defineResource({ table, model })` ties a Drizzle `PgTable` to an rxfy `ModelDescriptor`:

```ts
// src/blog/resources.ts
import { commentModel, postModel, userModel } from "examples-shared/data";
import { createResourceRegistry, defineResource } from "rxfy-server/browser";
import { comments, posts, users } from "../db/schema.js";

export const userResource = defineResource({ table: users, model: userModel });
export const postResource = defineResource({ table: posts, model: postModel });
export const commentResource = defineResource({ table: comments, model: commentModel });

export const resources = createResourceRegistry([userResource, postResource, commentResource]);
```

- Resource `name` defaults to `model.name` (falls back to the SQL table name). It is the live topic namespace (`"posts:uuid-..."`) and **must match the client model's `name`** so `patch` messages land in the right store.
- Single-column primary keys only: `primaryKeyColumn(table)` throws on composite or missing PKs.

`createResourceRegistry([...])` indexes resources by name, rejects duplicates, and exposes `byName(name)`, `model(name)`, `all()`.

## createServer

`createServer({ db, resources, hub, keyer })` returns a `Live` object with typed write methods and a grant helper:

```ts
// server/live.ts
import { createInMemoryHub, createServer, createTopicKeyer } from "rxfy-server";
import { resources } from "../src/blog/resources.js";
import { db } from "./db.js";

export const hub = createInMemoryHub();

export const live = createServer({
  db,
  resources,
  hub,
  keyer: createTopicKeyer({ secret: process.env.RXFY_SECRET ?? "dev-secret", windowMs: 10 * 60_000 }),
});
```

`live.db` exposes the raw Drizzle instance for reads outside of writes.

## Writes

| Call | SQL | Publishes |
|---|---|---|
| `live.update(resource, id, patch)` | UPDATE … RETURNING | `patch` on `"<name>:<id>"` topic + `stale` on touched channels |
| `live.create(resource, row, { touch })` | INSERT | `stale` on touched channels only (no patch) |
| `live.delete(resource, id, { touch })` | DELETE | `stale` on touched channels only |
| `live.touch(...targets)` | none | `stale` out of band |

```ts
import { touch, type StateChannelDescriptor } from "rxfy-server";

const postsChannel = postsState as unknown as StateChannelDescriptor;

// update — publishes a `patch` on the entity topic automatically
await live.update(postWriteResource, postId, { title, body });

// create — no patch; touch the state channels that list this entity
await live.create(
  postWriteResource,
  { id: newId(), userId, title, body },
  { touch: [touch(postsChannel, {})] },
);

// delete — same: no patch, touch the channels that referenced this entity
await live.delete(postResource, postId, { touch: [touch(postsChannel, {})] });
```

`touch(stateDescriptor, params)` builds a `TouchTarget` for a state instance. Window dimensions declared in `state.window` (page, cursor, sort) are stripped from the channel key, so all windows of the same partition share one invalidation channel.

## createTopicKeyer

`createTopicKeyer({ secret, windowMs })` converts raw topic strings into time-windowed HMAC ids; clients only ever see the opaque ids.

- `keyer.current(topic)` — id for the current time window; used by `live.grant` for client subscriptions.
- `keyer.forPublish(topic)` — `[currentId, previousId]`; publishing on both covers window rollover so grants issued just before the boundary still receive messages.

Keep `windowMs` long enough for the grant-to-subscribe round-trip. **Warning:** rotating `secret` invalidates all outstanding grants immediately — clients miss messages until they refetch a fresh grant.

## createInMemoryHub

`createInMemoryHub()` is the single-process pub/sub backbone: maps opaque routing ids to connections and forwards `ServerMessage`s from writes to clients. Register a delivery sink with `hub.onPublish(sink)`; the transport adapter calls `hub.subscribe`/`unsubscribe`/`drop` as connections open and close.

## live.grant

`live.grant(registry, { entities, states })` issues a `{ entities, channels }` token the client uses to subscribe to live updates — return it alongside the initial data. Covered in depth in `grants-hydration.md`.
