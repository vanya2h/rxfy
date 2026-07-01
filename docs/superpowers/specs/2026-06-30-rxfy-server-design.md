# rxfy-server / rxfy-ws — Design

**Date:** 2026-06-30
**Status:** Draft for review
**Packages:** `rxfy-protocol` (zero-dep wire contract), `rxfy-server` (runtime-agnostic core),
`rxfy-ws` (default WebSocket transport adapter)

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

- `rxfy-protocol` — a standalone, zero-dependency package holding the wire contract
  (`ServerMessage` / `ClientMessage`, the protocol version, and serialize/parse guards), shared
  by the server, the client, and every transport adapter.
- `defineResource` — bind a Drizzle table to an rxfy `ModelDescriptor` (no codegen).
- Server write functions: `update` (live patch), `create` / `delete` (structural touch).
- Transport-agnostic broadcast core: a pure pub/sub subscription hub (no server-side counters).
- Hashed topic keys (`grant` / topic-key deriver) for stateless authorization.
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
| 4 | Authorization | **Hashed topic keys** — opaque `HMAC(secret, topic + window)` ids issued at data-send time; possession = capability; pure routing, self-expiring |
| 5 | Runtime scope | **Core + transport adapters** (default `rxfy-ws`) |
| 6 | Client write path | **Server functions; the app exposes them** via its own endpoints |
| 7 | Update granularity | **Hybrid** — live in-place entity patches + per-state counter for structure |
| 8 | Pagination invalidation | **First-class window/partition split** — invalidation channel derived from partition params only |

## 4. Architecture Overview

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  rxfy-protocol (standalone, zero deps)                              │
  │    ServerMessage | ClientMessage, PROTOCOL_VERSION, parse/serialize │
  └──────────────────────────────────────────────────────────────────┘
        ▲ depended on by server, client, and every transport adapter

                          shared (isomorphic, no DB driver)
  ┌──────────────────────────────────────────────────────────────────┐
  │  defineResource(table) ─► { model, zod, getKey, name, channels }    │
  │  defineState({ window }) ─► invalidationChannel() derivation         │
  │  topic-key shape (HMAC id derivation, types)                        │
  └──────────────────────────────────────────────────────────────────┘
        │ imported by server                    │ imported by client
        ▼                                        ▼
  ┌─────────────────────────┐            ┌──────────────────────────────┐
  │ rxfy-server (server)     │            │ rxfy-server/client + rxfy-react│
  │  createServer({db,hub,   │            │  createLiveClient(...)         │
  │    keyer, resources})    │            │  useStateData (counter+patch)  │
  │  update / create / delete │            │  applies patch -> store.set    │
  │  touch / grant           │            │  counts stale -> updatesAvailable│
  │  Broadcaster + Hub (pub/sub)│           └──────────────────────────────┘
  └─────────────────────────┘                        ▲
        │ publishes messages                          │ ws frames
        ▼                                             │
  ┌─────────────────────────┐    ws    ┌──────────────────────────────┐
  │ rxfy-ws (server adapter) │◄────────►│ rxfy-ws (client adapter)      │
  │  route by opaque id      │          │  subscribe / unsubscribe       │
  │  bind conn <-> topics    │          │                                │
  └─────────────────────────┘          └──────────────────────────────┘
```

Data enters rxfy's normalized stores through exactly the paths that already exist; the live
layer is an additional writer into `ModelStore.set` (for patches) and a `stale`-signal source
that drives a purely client-side per-state counter (for staleness).

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
irrelevant. A create/delete in org A touches `posts:orgId=A` exactly once → every subscribed
client on any page and sort order of org A increments its local counter; org B is untouched.

Membership-affecting filters (e.g. `status`) are partition dims by intent; the app decides
which partition(s) a write touches.

### 5.3 Server: write functions

Server-only. Constructed once via `createServer`:

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { createServer, createInMemoryHub, createTopicKeyer } from "rxfy-server";

const db = drizzle(process.env.DATABASE_URL!);

export const live = createServer({
  db,
  resources,
  hub: createInMemoryHub(),
  keyer: createTopicKeyer({ secret: process.env.RXFY_SECRET!, windowMs: 10 * 60_000 }),
});
```

```ts
// UPDATE — live entity patch (+ optional structural touch if membership changed)
const row = await live.update(posts, id, { title }, { touch?: TouchTarget[] });
//  1. db.update(table).set(patch).where(eq(pk,id)).returning() -> full row
//  2. publish on topic `post:${id}` (keyer.forPublish derives the hub ids), msg { v:1, kind:"patch", name:"post", id, data: row }
//  3. for each touch target: publish { v:1, kind:"stale", channel } (see touch)

// CREATE — structural; counter only, no data pushed
const row = await live.create(posts, values, { touch: [touch(postsState, { orgId })] });
//  1. db.insert(table).values(values).returning() -> full row
//  2. for each touch target: publish { v:1, kind:"stale", channel } to subscribers

// DELETE — structural; counter only
await live.delete(posts, id, { touch: [touch(postsState, { orgId })] });
//  1. db.delete(table).where(eq(pk,id))
//  2. for each touch target: publish { v:1, kind:"stale", channel } to subscribers
```

Writes use `.returning()` so the `patch` broadcast carries the authoritative merged row;
every client converges regardless of the partial patch sent. The row is also returned to the
caller for its HTTP response.

`touch(state, partitionParams)` is a helper returning a `TouchTarget` (`{ channel }`) by
running `invalidationChannel`; window dims in the supplied params are ignored. `live.touch(...)`
exists standalone for changes not tied to a single write.

The app calls these from its own endpoints (REST/RPC/server action); clients write via normal
`fetch`/POST. The framework stays out of the request layer.

### 5.4 Broadcaster / hub (pure pub/sub)

`rxfy-server` defines a transport-agnostic `Broadcaster`/`Hub` contract. It is **pure pub/sub**
— it holds no counters. The "N updates available" number is a purely client-side count (see
§5.8); the server never tracks per-channel revisions, so a `touch` is just a broadcast.

```ts
type Hub = {
  publish(topic: string, msg: ServerMessage): void;
  subscribe(conn: ConnId, topics: string[]): void;
  unsubscribe(conn: ConnId, topics: string[]): void;
  drop(conn: ConnId): void;
  onPublish(sink: (conn: ConnId, msg: ServerMessage) => void): void;
};
```

At the hub boundary, `topic`/`channel` keys are the **opaque hashed ids** from §5.5, not the
plaintext names: subscribers join by id, and the server's publish helper derives the id(s) via
`keyer.forPublish(topic)` before calling `publish`. So the hub never sees a plaintext topic and
needs no secret — it is pure opaque-string routing.

`createInMemoryHub()` keeps a single `Map<id, Set<ConnId>>` and delivers via the registered
sink. A transport adapter registers a sink that serializes and writes to the matching socket.
Multi-process backends (Redis pub/sub) implement the same contract later with no protocol
change.

### 5.5 Hashed topic keys & grants

A subscribable topic is addressed not by its plaintext name but by an **opaque, unguessable
id** derived with a keyed hash. Possession of the id *is* the capability — an attacker who
lacks it cannot guess it (the secret makes it unforgeable) and therefore cannot subscribe.

```
topicId(topic, t) = base64url(HMAC-SHA256(secret, `${topic}:${windowOf(t)}`))
windowOf(t)       = floor(t / windowMs)
```

```ts
createTopicKeyer({ secret, windowMs }) => {
  current(topic: string): string;          // id for the current window
  forPublish(topic: string): string[];     // [current, previous] window ids (boundary cover)
};
```

There is **no verification step**: the `rxfy-ws` adapter treats ids as opaque routing keys.
Routing is still fully stateless because the server recomputes the *same* id at publish time —
`live.update(posts, 42, …)` publishes on `current("post:42")`, which equals the id the client
holds. The hub matches opaque strings; no reverse map.

**Expiry is structural.** Because the window id is folded into the hash, an id stops matching
once the window rolls. The publisher emits on both the current and previous window ids so a
subscription never drops mid-window; a client holding an expired id simply goes quiet and
re-subscribes after its next grant refresh (on refetch, or a periodic refresh shorter than
`windowMs`). A leaked id is therefore only useful until the window expires.

**Tradeoffs (documented, accepted):** revocation granularity is the window, not per-client;
early/selective revocation ("kick one user now") requires server-side subscription state and is
a v1 non-goal (signed tokens share this limitation). Ids MUST be treated as secrets: never
logged, only sent over `wss`. The id is more sensitive than the data snapshot it ships beside,
because it grants access to *future* updates — hence the bounded window.

`grant()` turns "what this response is allowed to see" into topic ids, reusing the
authorization the app already performed when it chose which rows to fetch:

```ts
const grants = live.grant(registry, {
  entities: posts,                                   // auto: id per post:<id> in the store
  states: [{ state: postsState, params: { orgId, page, sort } }],  // channel id
});
// grants = {
//   entities: Record<topic, id>,                    // for patch subscriptions
//   channels: Record<channel, id>,                  // for stale subscriptions
// }
```

- **Entity ids are automatic** — `grant` reads the registry's `post` store (`valueEntries()`)
  for the ids actually present, i.e. exactly the rows in the response, and derives
  `topicId("post:<id>")` for each.
- **Channel ids** are derived from the supplied states (it needs each state's `window` to
  compute the invalidation channel). No baseline number is sent — the staleness count lives
  entirely on the client (§5.8) and resets on refetch.
- The client never computes a hash (it has no secret); it looks ids up from the grants map by
  plaintext topic, exactly as it would have looked up a token.

**Grant shape.** A grant is a lookup table from a plaintext topic the client can reason about to
the opaque id it must present to subscribe:

```ts
grants = {
  entities: { "post:1": "k7Fa9…", "post:2": "9xQ2b…" },   // topic           -> id (patch subs)
  channels: { "posts:orgId=A": "p3Lm0…" },                 // invalidation ch -> id (stale subs)
}
```

**Grant lifecycle (server → wire → client).**

1. **Mint (server, at data-send time).** Whenever the server sends data it mints grants for
   exactly that data, reusing the authorization the fetch already performed. `live.grant` reads
   the seeded registry for entity ids and runs `invalidationChannel` for each state, deriving a
   windowed `topicId` for each. Possession of the data and the right to subscribe are produced
   together.

2. **Deliver (two paths).**
   - **SSR:** embedded in the hydration script next to the data —
     `hydrationScript({ ...dehydrate(registry), grants })` emits
     `window.__RXFY_SSR__ = { queries, models, grants }`. `StoreProvider` drains it and feeds
     `grants` to `createLiveClient`.
   - **Client fetch** (navigation, `reload`, new page): the data endpoint returns
     `{ data, grants }`; the `fetchFn` calls `liveClient.addGrants(grants)` and returns `data`.

   Either way the live client accumulates a `Map<topic, id>` of currently-valid grants.

3. **Use (client, by lookup — never computes an id).**
   - **Entity patches:** the live client watches `registry.added$`; for each `{ name, key }` it
     looks up `grants.entities["${name}:${key}"]` and subscribes with that id. A server `patch`
     on `post:1` then routes back and applies via `store.set`.
   - **Staleness:** `useStateData` derives its channel with `invalidationChannel(state, params)`,
     looks up `grants.channels[channel]`, and subscribes; inbound `stale` increments the local
     counter.

4. **Refresh & expiry.** Grants are short-lived (the hash's time window). Every refetch returns
   fresh-window grants that `addGrants` merges and re-subscribes with — this is also how a
   newly-created entity (pulled in by a post-`stale` refetch) obtains *its* grant, through the
   normal fetch path with no special create-token machinery. If a window rolls while the client
   is idle, stale ids quietly stop matching until the next refetch supplies new-window ids.

### 5.6 Wire protocol (`rxfy-protocol`, standalone & versioned)

The wire contract lives in its own zero-dependency package, `rxfy-protocol`, so the server, the
client, and every transport adapter depend on the contract — not on each other. It exports the
message unions, a `PROTOCOL_VERSION` constant, and `serialize`/`parse` guards (the only logic;
no runtime deps). A small documented union with a version field; the only entity-data message
is `patch`.

```ts
type ServerMessage =
  | { v: 1; kind: "patch"; name: string; id: string; data: unknown }  // live entity update
  | { v: 1; kind: "stale"; channel: string };                         // "this channel changed"

type ClientMessage =
  | { v: 1; kind: "subscribe";   ids: string[] }        // opaque hashed topic ids
  | { v: 1; kind: "unsubscribe"; ids: string[] };
```

`stale` carries no number — it is a bare "something changed in this channel" signal. The client
increments its own per-channel counter on receipt (§5.8). Reconnect is just re-`subscribe`
(there is no server-side revision to resynchronize), so no `resume` message is needed. The
tradeoff: a `stale` missed during a disconnect under-counts, and a duplicate over-counts — both
acceptable because the count is a soft hint and `applyUpdates()` reconciles by refetching.

### 5.7 Transport adapter — `rxfy-ws`

**Server side.** Thin wiring between a `ws` server and the hub — pure routing, no verify:

- On connection: nothing required (ids carry their own authority). The upgrade handler may
  still enforce app-level auth (cookie/session) before accepting the socket.
- On `subscribe`: `hub.subscribe(conn, ids)` directly — ids are opaque routing keys. There is
  no token to parse or signature to check; an id the server never publishes to simply never
  receives anything, so a forged/expired id is inert.
- Registers a hub sink that serializes `ServerMessage` and writes to the bound socket.
- On close: `hub.drop(conn)`.

**Client side** (`rxfy-ws/client`, consumed by `createLiveClient`): opens the socket, sends
`subscribe`/`unsubscribe`, parses `ServerMessage`, hands them to the live client. Handles
reconnect with backoff and replays its current subscription ids (re-`subscribe`); there is no
revision to resync, so reconnect is stateless on the wire.

### 5.8 Client live wiring

`createLiveClient` connects the transport to an rxfy `ModelRegistry`:

```ts
import { createLiveClient } from "rxfy-server/client";

const liveClient = createLiveClient({
  url: "wss://example.com/live",
  registry,                 // the same registry StoreProvider uses
  resources,                // name -> model
  grants: window.__RXFY_SSR__.grants,   // initial table (SSR); optional
  transport: wsTransport,   // from rxfy-ws/client (default)
});

// later, on every client-side fetch:
liveClient.addGrants(grants);   // merge fresh-window ids; re-subscribes affected topics
```

`addGrants(grants)` merges a new `{ entities, channels }` table into the live client's
`Map<topic, id>` (newer ids supersede older ones for the same topic) and re-subscribes any topic
whose id changed. It is the single entry point both delivery paths feed into.

Behavior:

- **Entity patches.** Watches `registry.added$`; for each held entity it looks up the grant
  id for `name:<id>` and subscribes. Inbound `patch` → `registry.model(byName).set(id, data)`,
  which propagates to every `store.get(id)` subscriber. New entities discovered after a refetch
  get their ids from the refreshed grants payload.
- **Counter (purely client-side, per client, never shared).** Owns one integer per subscribed
  channel, starting at `0`. Each inbound `stale` for that channel does `count++`. The count
  resets to `0` whenever the state's `fetchFn` completes (refetch). The live client exposes a
  per-channel `available$` that emits this count. There is no server-side revision, baseline, or
  diff — `available$` *is* the local count. A `stale` missed during a disconnect under-counts and
  a duplicate over-counts; both are acceptable because the count is a soft "want to refresh?"
  hint that `applyUpdates()` reconciles by refetching.
- Idempotent on the patch path. Subscription cleanup is best-effort: when a refetch supersedes a
  query and an entity is no longer referenced by any live query, the client may prune its
  `name:<id>` subscription. Stale entities lingering in a store are harmless (deletes are
  surfaced via the counter + refetch, not a live store removal), so no `ModelStore.remove`
  primitive is required for v1.

`StoreProvider` accepts the `liveClient` and exposes it via context.

### 5.9 `useStateData` integration

`useStateData` derives its invalidation channel from `state` + `params` + `state.window`,
subscribes through the live client using the channel grant id, and extends the handle:

```ts
type StateHandle<...> = {
  data$: Observable<TQuery>;
  // ...existing: set, setRaw, reload, mutations
  updatesAvailable$: Observable<number>;   // local per-channel count, ++ on stale, 0 on refetch
  applyUpdates(): void;                     // reload() + reset the local count to 0
};
```

When `fetchFn` completes (initial load, `reload`, `applyUpdates`, or a params change), the
channel's local count resets to `0`. `applyUpdates()` is sugar for "refetch and clear the badge."

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

Grants travel inside the existing dehydration payload — no new transport, and dehydration stays
orthogonal to granting:

- `dehydrate(registry)` is **unchanged** (`{ queries, models }`) — a pure rxfy-core concern with
  no dependency on the live layer.
- The app composes the payload directly: `live.grant(...)` produces `grants`, and
  `hydrationScript({ ...dehydrate(registry), grants })` embeds it. No `dehydrateWithGrants`
  wrapper — granting needs the state descriptors (for each state's `window`) that `dehydrate`
  doesn't, so fusing them saves a line while coupling a core primitive to `rxfy-server`. The
  client reads `window.__RXFY_SSR__.grants`.
- **Streaming SSR** (`rxfy-react/next` `HydrationStream`): the streaming wrapper is the one place
  that *does* attach grants programmatically — each streamed chunk carries the grants for the
  entities/states it introduces, appended the same way query/model chunks already are.
- On the client, `StoreProvider` drains grants alongside the existing hydration and feeds them
  to `createLiveClient`.

## 6. End-to-End Flows

**Live field update.** `editPost` endpoint → `live.update(posts, id, { title })` → DB update +
`patch` on `post:<id>` → hub fan-out → client `store.set(id, row)` → `PostRow` re-renders. No
refetch, non-disruptive.

**Create (structural).** `createPost` endpoint → `live.create(posts, values, { touch:[touch(postsState,{orgId})] })`
→ DB insert + `stale` broadcast on `post:list:<orgId>`'s id → every subscribed client (any
page/sort of org A) does `count++`, so `updatesAvailable$` increments → user clicks "N updates
available" → `applyUpdates()` refetches the current page via `fetchFn` and resets the count to
0; the new entity + its grant arrive through the normal fetch path.

**Delete (structural).** Same as create — counter only; the refetch reflects the removal.

**Reconnect.** Client reconnects and re-sends `subscribe` with its current ids — there is no
server revision to resync. `stale` signals missed while disconnected are simply not counted, so
the badge may under-report until the next refetch (a soft hint, by design). If the reconnect
spans a window boundary, the client refreshes grants (refetch) to obtain ids for the new window,
which also resets the count.

## 7. Package Layout

```
packages/
  rxfy-protocol/         # standalone, zero runtime deps
    src/
      messages.ts        # ServerMessage | ClientMessage, PROTOCOL_VERSION
      codec.ts           # serialize / parse guards
      index.ts
    package.json         # exports: "."
  rxfy-server/
    src/
      resource.ts        # defineResource, channel, createResourceRegistry (shared)
      state-channel.ts   # invalidationChannel, window/partition split (shared)
      topic-key.ts       # createTopicKeyer: HMAC topic-id derivation + windowing (server)
      server.ts          # createServer: update/create/delete/touch/grant (server)
      hub.ts             # Hub contract + createInMemoryHub (server)
      drizzle.ts         # drizzle-zod derivation + write helpers (server)
      client/
        live-client.ts   # createLiveClient (client)
    package.json         # exports: ".", "./client"; dep: rxfy-protocol
  rxfy-ws/
    src/
      server.ts          # ws <-> hub adapter (server); deps: rxfy-protocol, rxfy-server (Hub type)
      client.ts          # ws transport for createLiveClient (client); dep: rxfy-protocol
    package.json         # exports: ".", "./client"
```

Client-safe modules avoid any DB-driver import. `rxfy-react` gains the `useStateData` counter
integration and `StoreProvider` `liveClient` prop (a `rxfy-server` peer dep, optional).

Dependency graph (no cycles): `rxfy-protocol` ← `rxfy-server`, `rxfy-ws`. `rxfy-ws` server also
imports the `Hub` *type* from `rxfy-server`; the `rxfy-ws` client imports only `rxfy-protocol`
(plus the transport-interface type from `rxfy-server/client`).

Peer deps: `rxfy-protocol` (none); `rxfy`, `drizzle-orm`, `drizzle-zod`, `zod`, `rxfy-protocol`
(server core); `ws`, `rxfy-protocol` (`rxfy-ws` server); `rxfy`, `react` (client).

## 8. Testing Strategy

- **Unit (Vitest, node).** Channel derivation (window/partition, key stability); topic-key
  derivation (unguessability, same id at publish time, window rollover + current/previous
  coverage); hub pub/sub fan-out; `grant` id shape from a seeded registry; resource derivation
  (PK detection, single-PK guard).
- **Protocol.** Round-trip serialize/parse for every message variant; version field presence.
- **Integration (in-memory hub, no real ws).** `update` → subscriber receives `patch`;
  `create`/`delete` → subscribers of the touched channel receive a `stale` signal; an
  unsubscribed/other channel receives nothing.
- **`rxfy-ws`.** Loopback `ws` server: id-routed subscribe (live id delivers, forged/expired id
  inert), fan-out, drop-on-close, reconnect re-subscribe.
- **Client.** `createLiveClient` applies `patch` to a store; `available$` increments once per
  `stale` and resets to `0` on refetch; `useStateData` counter + `applyUpdates` reset.
- **DB-touching write tests** run against a disposable Postgres (testcontainers or a local
  instance), kept separate from the pure-unit suite.

## 9. Open Questions / Future Work

- **Redis hub** for multi-process fan-out (same pub/sub `Hub` contract; no counters to share).
- **CDC adapter** (`LISTEN`/`NOTIFY` or logical replication) to capture writes that bypass the
  framework — opt-in, emits the same `patch`/`stale` messages.
- **Client command channel** — client→server mutations over the same socket, authorized by the
  same hashed-id scheme, if the app-endpoint write path proves insufficient.
- **Selective/early revocation** — server-side subscription state to kick a specific client
  before its window expires (both hashed ids and signed tokens lack this today).
- **Prisma adapter** behind the same `defineResource`/write surface.
- **Composite primary keys.**
- **Batch ids** — a single grant id covering a set of entities to shrink large list payloads.

## 10. Changesets

Per repo convention, new public exports in published packages require a changeset.
`rxfy-protocol`, `rxfy-server`, and `rxfy-ws` are new packages (initial `minor`/`0.x`); the
`rxfy-react` additions
(`useStateData` counter fields, `StoreProvider.liveClient`) get their own changesets at implementation time. No new `rxfy` core exports are required for
v1 (the live layer writes through the existing `ModelStore.set`).
