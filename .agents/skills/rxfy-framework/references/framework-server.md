# rxfy-server

Binds Drizzle ORM tables to rxfy models, runs database writes through the server, and publishes live update messages via a hub. Server-side only; `rxfy-server/browser` re-exports the client-safe subset (`defineResource`, `createResourceRegistry`, `invalidationChannel`, and their types) for shared code.

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

`createServer({ db, resources, hub })` returns a `Live` object with typed write methods plus the two
session-tracking calls, `serve` and `hydration`:

```ts
// server/live.ts
import { createInMemoryHub, createServer } from "rxfy-server";
import { resources } from "../src/blog/resources.js";
import { db } from "./db.js";

// The hub holds live session subscriptions, so there must be exactly ONE instance. entry-server's
// render (typed by the shared RenderFn in server/render-types.ts) receives `live` — and `apiFetch`,
// hono's in-process `app.request`, for SSR data fetching — as parameters instead of importing
// server modules, so a separate Vite SSR module graph never instantiates a second db/hub/api.
// server/render.ts calls render(url, live, api.request); `request` is a bound arrow, safe to detach.
export const hub = createInMemoryHub();

export const live = createServer({ db, resources, hub });
```

`live.db` exposes the raw Drizzle instance for reads outside of writes.

## Writes

| Call | SQL | Publishes |
|---|---|---|
| `live.update(resource, id, patch)` | UPDATE … RETURNING | `patch` on `"<name>:<id>"` topic + `stale` on touched channels |
| `live.create(resource, row, { touch })` | INSERT | `stale` on touched channels only (no patch) |
| `live.delete(resource, id, { touch })` | DELETE | `stale` on touched channels only |
| `live.touch(...targets)` | none | `stale` out of band |

Return values: `create` resolves the inserted row. `update` resolves the updated row, or `undefined` when no row matches the id — a not-found update writes nothing and publishes nothing (no patch, no touch).

```ts
import { touch } from "rxfy-server";

// update — publishes a `patch` on the entity topic automatically
await live.update(postWriteResource, postId, { title, body });

// create — no patch; touch the state channels that list this entity
await live.create(
  postWriteResource,
  { id: newId(), userId, title, body },
  { touch: [touch(postsState, {})] },
);

// delete — same: no patch, touch the channels that referenced this entity
await live.delete(postResource, postId, { touch: [touch(postsState, {})] });
```

`touch(stateDescriptor, params)` builds a `TouchTarget` for a state instance. Window dimensions declared in `state.window` (page, cursor, sort) are stripped from the channel key, so all windows of the same partition share one invalidation channel.

## createInMemoryHub

`createInMemoryHub({ ttlMs? })` is the single-process pub/sub backbone: pub/sub over subscription
ids, keyed by **session** (not by connection). Subscriptions are written only by the serve path
(`live.serve` / `live.hydration`); the WS layer only binds/releases sockets, it never writes
subscriptions itself.

```ts
export type Hub = {
  publish: (id: string, message: ServerMessage) => void;
  subscribe: (session: string, ids: string[]) => void;
  unsubscribe: (session: string, ids: string[]) => void;
  bind: (session: string) => void;
  release: (session: string) => void;
  drop: (session: string) => void;
  onPublish: (sink: (session: string, message: ServerMessage) => void) => void;
};
```

- `bind`/`release` track socket liveness: `createWsServer` calls `bind` when a session's `hello`
  arrives and `release` when that socket closes. A bound session never expires.
- An unbound session (never connected, or disconnected) keeps its subscriptions for `ttlMs`
  (default 5 minutes) before `drop` — this covers an SSR render whose client hasn't opened the
  WebSocket yet, and a closed tab that might reconnect.
- Register the delivery sink with `hub.onPublish(sink)` — `createWsServer` does this internally to
  route `patch`/`stale` messages to the right socket by session id.

## live.serve and live.hydration

Covered in depth in `live-sessions.md`. In short:

- `live.serve(req, state, params, data)` — read-endpoint wrapper; accepts the state's *input* shape
  (raw DB rows — unbranded ids, extra columns OK), parses it through the state's schemas, registers
  the entities plus the state's channel under the requesting session (read from the
  `RXFY_SESSION_HEADER` header, or pass a session id directly), and returns the parsed shape
  (ids branded, unknown keys stripped).
- `live.hydration(registry)` — one-call SSR payload: mints a session, registers everything the
  render's registry holds, and returns the `hydrationScript` string (dehydrated state + session).

Apps on the bare hub (no `createServer` — e.g. an in-memory store publishing `stale` only) get the
same one-call SSR payload from `hubHydration(hub, registry)` in `rxfy-server/hub`: mints a session,
subscribes it to the registry's logged channels, returns the script. `live.hydration` wraps it,
adding entity subscriptions for resource-backed models.
