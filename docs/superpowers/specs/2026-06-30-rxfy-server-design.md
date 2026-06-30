# rxfy-server / rxfy-ws — Design

**Date:** 2026-06-30
**Status:** Draft for review
**Packages:** `rxfy-server` (runtime-agnostic core), `rxfy-ws` (default WebSocket transport adapter)

## 1. Goal

Provide a higher-level, server-side framework on top of rxfy that delivers **live data
updates at no extra developer cost**. A single server-side write call both persists to the
database *and* notifies all relevant clients. The framework owns model→DB derivation, the
broadcast protocol, capability-based authorization, and the client wiring that applies
updates to rxfy's existing normalized stores.

Two distinct, deliberately different live behaviors:

- **Entity field updates are pushed live** and applied in place (non-disruptive — a value
  changes and the component re-renders without a refetch).
- **Structural changes** (create / delete / reorder / pagination membership) are surfaced as
  a per-state **"N updates available" counter**. The user's flow is never interrupted; they
  opt into a refetch by clicking the badge, which re-runs the state's existing `fetchFn`.

## 2. Scope

### In scope (v1)

- `defineResource` — bind a Drizzle table to an rxfy `ModelDescriptor` (no codegen).
- Server write functions: `update` (live patch), `create` / `delete` (structural touch).
- Transport-agnostic broadcast core: subscription hub + revision counters.
- Capability tokens (`grant` / signer / verifier) for stateless authorization.
- `window`/partition split for paginated state invalidation.
- `rxfy-ws` default transport adapter over the `ws` library.
- Client wiring: live client + integration into `useStateData` (entity patches + counter).
- SSR integration: grants travel inside the existing dehydration payload.

### Non-goals (v1)

- Database CDC / `LISTEN`/`NOTIFY` (framework-mediated writes only).
- A client→server command channel (writes go through the app's own endpoints).
- Live-query auto-reconciliation (we use the counter model instead).
- Composite primary keys (single-column PK only, matching rxfy's `EntityKey<T>`).
- Multi-process pub/sub (in-memory hub only; Redis adapter is a documented future).
- Prisma adapter (Drizzle only; the binding is adapter-shaped for a future Prisma adapter).

## 3. Key Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Source of truth for model shape | **DB schema leads** — Drizzle table → derive rxfy model + Zod via `drizzle-zod` |
| 2 | Change detection | **Framework-mediated writes** — write functions persist *and* broadcast |
| 3 | Subscription granularity | **Per-entity topics + named channels** |
| 4 | Authorization | **Capability tokens** — signed topic grants issued at data-send time, verified statelessly |
| 5 | Runtime scope | **Core + transport adapters** (default `rxfy-ws`) |
| 6 | Client write path | **Server functions; the app exposes them** via its own endpoints |
| 7 | Update granularity | **Hybrid** — live in-place entity patches + per-state counter for structure |
| 8 | Pagination invalidation | **First-class window/partition split** — invalidation channel derived from partition params only |

## 4. Architecture Overview

```
                          shared (isomorphic, no DB driver)
  ┌──────────────────────────────────────────────────────────────────┐
  │  defineResource(table) ─► { model, zod, getKey, name, channels }    │
  │  defineState({ window }) ─► invalidationChannel() derivation         │
  │  protocol (ServerMessage | ClientMessage, version field)            │
  │  token format (sign/verify shape)                                   │
  └──────────────────────────────────────────────────────────────────┘
        │ imported by server                    │ imported by client
        ▼                                        ▼
  ┌─────────────────────────┐            ┌──────────────────────────────┐
  │ rxfy-server (server)     │            │ rxfy-server/client + rxfy-react│
  │  createServer({db,hub,   │            │  createLiveClient(...)         │
  │    signer, resources})   │            │  useStateData (counter+patch)  │
  │  update / create / delete │            │  applies patch -> store.set    │
  │  touch / grant           │            │  tracks rev -> updatesAvailable │
  │  Broadcaster + Hub + revs │            └──────────────────────────────┘
  └─────────────────────────┘                        ▲
        │ publishes messages                          │ ws frames
        ▼                                             │
  ┌─────────────────────────┐    ws    ┌──────────────────────────────┐
  │ rxfy-ws (server adapter) │◄────────►│ rxfy-ws (client adapter)      │
  │  verify(token)->topic    │          │  subscribe/unsubscribe/resume  │
  │  bind conn <-> topics    │          │                                │
  └─────────────────────────┘          └──────────────────────────────┘
```

Data enters rxfy's normalized stores through exactly the paths that already exist; the live
layer is an additional writer into `ModelStore.set` (for patches) and a signal source for the
query-cache-backed counter (for staleness).

## 5. Component Design

### 5.1 Resource definition (shared)

A **resource** ties a Drizzle table to an rxfy model. Drizzle *table definitions* are plain
isomorphic objects — importing one does not pull in the DB driver — so `defineResource` runs
on both client and server. Only the DB *connection* is server-only.

```ts
import { pgTable, text, integer } from "drizzle-orm/pg-core";
import { defineResource, channel, createResourceRegistry } from "rxfy-server";

export const postsTable = pgTable("posts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
});

export const posts = defineResource({
  table: postsTable,
  name: "post",            // topic namespace; required for live; defaults to table name
  // primary key auto-detected -> getKey
});

export const resources = createResourceRegistry([posts]);
```

`defineResource` produces (all derived, no codegen):

| Member | Type | Derivation |
|---|---|---|
| `model` | `ModelDescriptor<Post>` | `drizzle-zod createSelectSchema` → Zod → `createModel`, `name` set |
| `zod` | `z.ZodType<Post>` | `createSelectSchema(table)` |
| `getKey` | `(row) => string` | the table's single primary-key column |
| `name` | `string` | topic namespace |

`posts.model` is exactly the `ModelDescriptor` today's `useModelStore`/`useStateData` accept —
resources are drop-in with existing rxfy.

`createResourceRegistry([...])` builds a `name → { model, table }` map used by the server (for
writes) and a `name → model` map used by the client live layer (to apply inbound patches).

> Composite primary keys are a v1 non-goal. `defineResource` throws if the table's PK is not a
> single column.

### 5.2 State, `window`, and the invalidation channel (shared)

`defineState` gains an optional `window` array naming the params that slice *within* a dataset
(page, cursor, limit, sort). All other params are **partition** dims. The invalidation channel
is derived purely (identical function on both sides, so strings always match):

```ts
const postsState = defineState({
  key: "posts",
  params: z.object({ orgId: z.string(), page: z.number(), sort: z.enum(["new","top"]) }),
  window: ["page", "sort"],          // partition = { orgId }
  model: { posts: array(posts.model) },
});

// invalidationChannel(state, params) = `${state.key}:${stableKey(omit(params, state.window))}`
//   { orgId:"A", page:3, sort:"top" } -> "posts:orgId=A"
//   { orgId:"A", page:0, sort:"new" } -> "posts:orgId=A"   (same channel; all pages share)
//   no params                         -> "posts"           (global)
```

`stableKey` is a canonical, sorted, JSON-ish encoding of the partition params so key order is
irrelevant. A create/delete in org A bumps `posts:orgId=A` exactly once → every page and sort
order of org A shows the badge; org B is untouched.

Membership-affecting filters (e.g. `status`) are partition dims by intent; the app decides
which partition(s) a write touches.

### 5.3 Server: write functions

Server-only. Constructed once via `createServer`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { createServer, createInMemoryHub, createTokenSigner } from "rxfy-server";

const db = drizzle(process.env.DATABASE_URL!);

export const live = createServer({
  db,
  resources,
  hub: createInMemoryHub(),
  signer: createTokenSigner({ secret: process.env.RXFY_SECRET!, ttl: "10m" }),
});
```

```ts
// UPDATE — live entity patch (+ optional structural touch if membership changed)
const row = await live.update(posts, id, { title }, { touch?: TouchTarget[] });
//  1. db.update(table).set(patch).where(eq(pk,id)).returning() -> full row
//  2. hub.publish(`post:${id}`, { v:1, kind:"patch", name:"post", id, data: row })
//  3. for each touch target: bump + publish stale (see touch)

// CREATE — structural; counter only, no data pushed
const row = await live.create(posts, values, { touch: [touch(postsState, { orgId })] });
//  1. db.insert(table).values(values).returning() -> full row
//  2. for each touch target: bump + publish stale

// DELETE — structural; counter only
await live.delete(posts, id, { touch: [touch(postsState, { orgId })] });
//  1. db.delete(table).where(eq(pk,id))
//  2. for each touch target: bump + publish stale
```

Writes use `.returning()` so the `patch` broadcast carries the authoritative merged row;
every client converges regardless of the partial patch sent. The row is also returned to the
caller for its HTTP response.

`touch(state, partitionParams)` is a helper returning a `TouchTarget` (`{ channel }`) by
running `invalidationChannel`; window dims in the supplied params are ignored. `live.touch(...)`
exists standalone for changes not tied to a single write.

The app calls these from its own endpoints (REST/RPC/server action); clients write via normal
`fetch`/POST. The framework stays out of the request layer.

### 5.4 Broadcaster, hub, and revision counters

`rxfy-server` defines a transport-agnostic `Broadcaster`/`Hub` contract:

```ts
type Hub = {
  // pub/sub
  publish(topic: string, msg: ServerMessage): void;
  subscribe(conn: ConnId, topics: string[]): void;
  unsubscribe(conn: ConnId, topics: string[]): void;
  drop(conn: ConnId): void;
  // revision counters for stale channels
  bump(channel: string): number;          // ++rev, returns new rev
  rev(channel: string): number;           // current rev (0 if unseen)
  onPublish(sink: (conn: ConnId, msg: ServerMessage) => void): void;
};
```

`createInMemoryHub()` keeps `Map<topic, Set<ConnId>>` and `Map<channel, number>` for revs, and
delivers via the registered sink. A transport adapter registers a sink that serializes and
writes to the matching socket. Multi-process backends (Redis pub/sub + `INCR`) implement the
same contract later with no protocol change.

### 5.5 Capability tokens & grants

A token is a signed statement "bearer may subscribe to topic T until E":

```
token   = base64url(payload) + "." + base64url(HMAC-SHA256(secret, payload))
payload = { t: "post:42", exp: <unix>, sid?: "<session>" }
```

```ts
createTokenSigner({ secret, ttl, clock? }) => {
  sign(topic: string, opts?: { sid?: string }): string;
  verify(token: string, ctx?: { sid?: string }): string | null;  // returns topic or null
};
```

Verification recomputes the HMAC and checks `exp` (and `sid` if bound) — fully stateless, so
any server instance validates any token. Revocation is handled by short `ttl` plus re-issuing
grants on every refetch/reconnect.

`grant()` turns "what this response is allowed to see" into tokens, reusing the authorization
the app already performed when it chose which rows to fetch:

```ts
const grants = live.grant(registry, {
  entities: posts,                                   // auto: token per post:<id> in the store
  states: [{ state: postsState, params: { orgId, page, sort } }],  // channel token + baseline rev
});
// grants = {
//   entities: Record<topic, token>,                 // for patch subscriptions
//   channels: Record<channel, { token, rev }>,      // for stale subscriptions + fetch baseline
// }
```

- **Entity tokens are automatic** — `grant` reads the registry's `post` store
  (`valueEntries()`) for the ids actually present, i.e. exactly the rows in the response.
- **Channel tokens** are derived from the supplied states (it needs each state's `window` to
  compute the channel) and carry the current `rev` as the client's fetch baseline.
- `sid` binding (optional) ties tokens to the authenticated session so a leaked token can't be
  replayed by another user.

### 5.6 Wire protocol (shared, versioned)

`rxfy-server/protocol` — a small documented union with a version field; the only entity-data
message is `patch`.

```ts
type ServerMessage =
  | { v: 1; kind: "patch"; name: string; id: string; data: unknown }  // live entity update
  | { v: 1; kind: "stale"; channel: string; rev: number };            // counter bump

type ClientMessage =
  | { v: 1; kind: "subscribe";   tokens: string[] }     // capability tokens
  | { v: 1; kind: "unsubscribe"; topics: string[] }
  | { v: 1; kind: "resume";      revs: Record<string, number> };      // reconnect baseline sync
```

`stale` is level-triggered: the client always trusts the latest `rev` and diffs against its
fetch baseline, so duplicate or out-of-order delivery cannot desync the counter.

### 5.7 Transport adapter — `rxfy-ws`

**Server side.** Thin wiring between a `ws` server and the hub:

- On connection: optionally establish `ctx` (session/`sid`) from the upgrade request.
- On `subscribe`: `signer.verify(token, ctx)` each token; valid ones → `hub.subscribe(conn, topics)`.
  Invalid/expired tokens are ignored (optionally a `denied` notice for diagnostics).
- On `resume`: reply with current `hub.rev(channel)` for each requested channel so the badge is
  correct after a dropped connection; re-subscribe via the still-valid tokens the client resends.
- Registers a hub sink that serializes `ServerMessage` and writes to the bound socket.
- On close: `hub.drop(conn)`.

**Client side** (`rxfy-ws/client`, consumed by `createLiveClient`): opens the socket,
sends `subscribe`/`unsubscribe`/`resume`, parses `ServerMessage`, hands them to the live client.
Handles reconnect with backoff and replays current subscriptions via `resume`.

### 5.8 Client live wiring

`createLiveClient` connects the transport to an rxfy `ModelRegistry`:

```ts
import { createLiveClient } from "rxfy-server/client";

const liveClient = createLiveClient({
  url: "wss://example.com/live",
  registry,                 // the same registry StoreProvider uses
  resources,                // name -> model
  grants: window.__RXFY_SSR__.grants,
  transport: wsTransport,   // from rxfy-ws/client (default)
});
```

Behavior:

- **Entity patches.** Watches `registry.added$`; for each held entity it looks up the grant
  token for `name:<id>` and subscribes. Inbound `patch` → `registry.model(byName).set(id, data)`,
  which propagates to every `store.get(id)` subscriber. New entities discovered after a refetch
  get their tokens from the refreshed grants payload.
- **Counter.** Owns per-channel `{ baseline, latest }`. Inbound `stale` updates `latest`. The
  live client exposes a per-channel `available$ = max(0, latest - baseline)`.
- Idempotent throughout. Subscription cleanup is best-effort: when a refetch supersedes a
  query and an entity is no longer referenced by any live query, the client may prune its
  `name:<id>` subscription. Stale entities lingering in a store are harmless (deletes are
  surfaced via the counter + refetch, not a live store removal), so no `ModelStore.remove`
  primitive is required for v1.

`StoreProvider` accepts the `liveClient` and exposes it via context.

### 5.9 `useStateData` integration

`useStateData` derives its invalidation channel from `state` + `params` + `state.window`,
subscribes through the live client using the channel grant token, sets its baseline to the
`rev` in the fetch/SSR payload, and extends the handle:

```ts
type StateHandle<...> = {
  data$: Observable<TQuery>;
  // ...existing: set, setRaw, reload, mutations
  updatesAvailable$: Observable<number>;   // latest - baseline for this state's channel(s)
  applyUpdates(): void;                     // reload() + reset baseline to the new fetch payload's rev
};
```

Component usage:

```tsx
const handle = useStateData({ state: postsState, params: { orgId, page, sort }, fetchFn });
const available = useObservable(handle.updatesAvailable$);

return (
  <>
    {available > 0 && (
      <button onClick={() => handle.applyUpdates()}>{available} updates available</button>
    )}
    <PostList ids={useObservable(handle.data$).posts} />
  </>
);
```

Entity field updates arrive automatically through the patch path (no extra hook); the counter
is built in via `window`.

### 5.10 SSR integration

Grants travel inside the existing dehydration payload — no new transport:

- `dehydrate(registry)` is unchanged (`{ queries, models }`).
- A helper `dehydrateWithGrants(registry, live, { states })` returns
  `{ ...dehydrate(registry), grants }`, and `hydrationScript` embeds it. The client reads
  `window.__RXFY_SSR__.grants`.
- **Streaming SSR** (`rxfy-react/next` `HydrationStream`): each streamed chunk carries the grants
  for the entities/states it introduces, appended the same way query/model chunks already are.
- On the client, `StoreProvider` drains grants alongside the existing hydration and feeds them
  to `createLiveClient`.

## 6. End-to-End Flows

**Live field update.** `editPost` endpoint → `live.update(posts, id, { title })` → DB update +
`patch` on `post:<id>` → hub fan-out → client `store.set(id, row)` → `PostRow` re-renders. No
refetch, non-disruptive.

**Create (structural).** `createPost` endpoint → `live.create(posts, values, { touch:[touch(postsState,{orgId})] })`
→ DB insert + `bump("posts:orgId=A")` + `stale` broadcast → every page/sort of org A increments
`updatesAvailable$` → user clicks "N updates available" → `applyUpdates()` refetches the current
page via `fetchFn`; new entity + its grant arrive through the normal fetch path.

**Delete (structural).** Same as create — counter only; the refetch reflects the removal.

**Reconnect.** Client reconnects, resends `subscribe` (tokens still valid) + `resume` with last
revs → server replies with current revs → badge recomputed; no missed-bump desync because the
counter is level-triggered.

## 7. Package Layout

```
packages/
  rxfy-server/
    src/
      resource.ts        # defineResource, channel, createResourceRegistry (shared)
      state-channel.ts   # invalidationChannel, window/partition split (shared)
      protocol.ts        # ServerMessage | ClientMessage, version (shared)
      token.ts           # createTokenSigner (server) + verify shape (shared types)
      server.ts          # createServer: update/create/delete/touch/grant (server)
      hub.ts             # Hub contract + createInMemoryHub (server)
      drizzle.ts         # drizzle-zod derivation + write helpers (server)
      client/
        live-client.ts   # createLiveClient (client)
    package.json         # exports: ".", "./client", "./protocol"
  rxfy-ws/
    src/
      server.ts          # ws <-> hub adapter (server)
      client.ts          # ws transport for createLiveClient (client)
    package.json         # exports: ".", "./client"
```

Client-safe modules avoid any DB-driver import. `rxfy-react` gains the `useStateData` counter
integration and `StoreProvider` `liveClient` prop (a `rxfy-server` peer dep, optional).

Peer deps: `rxfy`, `drizzle-orm`, `drizzle-zod`, `zod` (server core); `ws` (`rxfy-ws` server);
`rxfy`, `react` (client).

## 8. Testing Strategy

- **Unit (Vitest, node).** Channel derivation (window/partition, key stability); token
  sign/verify incl. expiry & `sid`; hub pub/sub + rev counters; `grant` token/rev shape from a
  seeded registry; resource derivation (PK detection, single-PK guard).
- **Protocol.** Round-trip serialize/parse for every message variant; version field presence.
- **Integration (in-memory hub, no real ws).** `update` → subscriber receives `patch`;
  `create`/`delete` → subscribed channel receives `stale` with incremented rev; reconnect
  `resume` returns correct revs.
- **`rxfy-ws`.** Loopback `ws` server: token-gated subscribe (valid vs expired), fan-out,
  drop-on-close, reconnect/resume.
- **Client.** `createLiveClient` applies `patch` to a store and updates `available$` from
  `stale`; idempotency under duplicate delivery; `useStateData` counter + `applyUpdates` reset.
- **DB-touching write tests** run against a disposable Postgres (testcontainers or a local
  instance), kept separate from the pure-unit suite.

## 9. Open Questions / Future Work

- **Redis hub** for multi-process fan-out and shared rev counters (same `Hub` contract).
- **CDC adapter** (`LISTEN`/`NOTIFY` or logical replication) to capture writes that bypass the
  framework — opt-in, emits the same `patch`/`stale` messages.
- **Client command channel** — client→server mutations over the same socket with token auth,
  if the app-endpoint write path proves insufficient.
- **Prisma adapter** behind the same `defineResource`/write surface.
- **Composite primary keys.**
- **Batch tokens** — a single grant covering a set of entities to shrink large list payloads.

## 10. Changesets

Per repo convention, new public exports in published packages require a changeset. `rxfy-server`
and `rxfy-ws` are new packages (initial `minor`/`0.x`); the `rxfy-react` additions
(`useStateData` counter fields, `StoreProvider.liveClient`) get their own changesets at implementation time. No new `rxfy` core exports are required for
v1 (the live layer writes through the existing `ModelStore.set`).
