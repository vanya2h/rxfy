# rxfy-server

Runs writes through a storage adapter and publishes live update messages via a hub. Core `rxfy-server` is storage-agnostic; the Drizzle binding lives in **`rxfy-server-drizzle`** (`defineResource`, `drizzleStorage`, `type DrizzleBinding`) and an in-memory binding in **`rxfy-server-memory`** (`defineCollection`, `memoryStorage`, `type MemoryBinding`). Everything else — the hub API, `createResourceRegistry`, `signGrant`/`verifyGrant`, `grantsHydration`, `stateChannel`/`touch`, `createGrantIssuer`, `createLive`, and `type Live`/`LiveStorage`/`Resource` — imports from the single `rxfy-server` entry. There are no `rxfy-server/browser` or `rxfy-server/hub` subpaths.

## defineResource

`defineResource({ table, model })` — from `rxfy-server-drizzle` — ties a Drizzle `PgTable` to an rxfy `ModelDescriptor`. (An app without Drizzle uses `defineCollection({ name, model, seed? })` from `rxfy-server-memory`, which returns a resource whose binding is an in-memory `Map` with `.all()`/`.get(id)`.)

```ts
// src/blog/resources.ts
import { commentModel, postModel, userModel } from "examples-shared/data";
import { createResourceRegistry } from "rxfy-server";
import { defineResource } from "rxfy-server-drizzle";
import { comments, posts, users } from "../db/schema.js";

export const userResource = defineResource({ table: users, model: userModel });
export const postResource = defineResource({ table: posts, model: postModel });
export const commentResource = defineResource({ table: comments, model: commentModel });

export const resources = createResourceRegistry([userResource, postResource, commentResource]);
```

- Resource `name` defaults to `model.name` (falls back to the SQL table name). It is the live topic namespace (`"posts:uuid-..."`) and **must match the client model's `name`** so `patch` messages land in the right store.
- Single-column primary keys only: `primaryKeyColumn(table)` throws on composite or missing PKs.

`createResourceRegistry([...])` — from core `rxfy-server` — indexes resources by name, rejects duplicates, and exposes `byName(name)`, `model(name)`, `all()`. It is a neutral convenience lookup; `createLive` does not require it (the writers take a resource directly).

## createLive

`createLive({ storage, hub, secret })` returns a `Live` object with typed write methods plus
the grant-signing calls `serve`, `hydration`, and `renew`. `storage` is a `LiveStorage` adapter —
`drizzleStorage(db)` from `rxfy-server-drizzle` or `memoryStorage()` from `rxfy-server-memory`; the
writers delegate create/update/delete to it. `secret` is REQUIRED — it is the HMAC key used to sign
and verify channel grants, and it MUST be the same secret passed to the WS server. Optional:
`grantTtlMs` (default 15 min), `renewGraceMs` (default 5 min). `Live` is generic over the adapter's
binding: `Live<DrizzleBinding>` / `Live<MemoryBinding>`.

```ts
// server/live.ts
import { createInMemoryHub, createLive } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { db } from "./db.js";

// The hub holds socket-keyed live subscriptions, so there must be exactly ONE instance. entry-server's
// render (typed by the shared RenderFn in server/render-types.ts) receives `live` — and `apiFetch`,
// hono's in-process `app.request`, for SSR data fetching — as parameters instead of importing
// server modules, so a separate Vite SSR module graph never instantiates a second db/hub/api.
// server/render.ts calls render(url, live, api.request); `request` is a bound arrow, safe to detach.
export const hub = createInMemoryHub();

export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";
export const live = createLive({ storage: drizzleStorage(db), hub, secret: SECRET });
```

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

`createInMemoryHub()` is the single-process pub/sub backbone: pub/sub over subscription ids, keyed by
**socket** (`ConnId = number`), not by session. It takes no options (only an optional `{ now }`
injectable clock for tests) — there is no `ttlMs`. Subscriptions are written by the WS layer from
verified `subscribe` frames, and a closed socket drops everything it held.

```ts
export type Hub = {
  publish: (id: string, message: ServerMessage) => void;
  subscribe: (conn: ConnId, ids: string[], exp: number) => void;
  drop: (conn: ConnId) => void;
  onPublish: (sink: (conn: ConnId, message: ServerMessage) => void) => void;
};
```

- `subscribe(conn, ids, exp)` records the socket's topics with an expiry (the grant's `exp`);
  re-subscribing the same socket extends `exp` in place. There is no `bind` / `release` /
  `unsubscribe`.
- `drop(conn)` removes every subscription for that socket — `createWsServer` calls it when the
  socket closes.
- Register the delivery sink with `hub.onPublish(sink)` — `createWsServer` does this internally to
  route `patch`/`stale` messages to the right socket by `ConnId`.

## live.serve, live.hydration, live.renew

Covered in depth in `live-grants.md`. In short:

- `live.serve(state, params, data)` — read-endpoint wrapper (no `req`); accepts the state's *input*
  shape (raw DB rows — unbranded ids, extra columns OK), parses it through the state's schemas, signs
  a grant for the state's channel, and returns the parsed shape (ids branded, unknown keys stripped)
  with the grant attached as a reserved `$grant` field. Stateless — it never touches the hub.
- `live.hydration(registry)` — one-call SSR payload: signs one grant per channel the render logged
  into `registry.channels`, and returns the `hydrationScript` string carrying the dehydrated state
  plus `grants: string[]`.
- `live.renew(grant)` — verifies a grant (accepting tokens expired within `renewGraceMs`) and returns
  a freshly-dated grant string, or `null` when the signature is invalid or beyond grace. Mount it
  behind the app's own auth on `POST /live/renew`.
