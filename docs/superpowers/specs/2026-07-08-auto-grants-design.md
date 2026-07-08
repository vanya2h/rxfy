# Automatic Live Subscriptions: server-held sessions, no grants

**Date:** 2026-07-08 (revised 2026-07-09)
**Status:** Approved

## Summary

Delete the grant concept from the framework entirely. Live subscriptions become **server-held**: the server records what each session was served and pushes updates to it — the client never subscribes to anything.

1. Every browser session has an id: minted by the server during SSR and embedded in the hydration payload, or self-generated for client-only apps. The client announces it over the WebSocket (`hello` frame) and attaches it to HTTP requests (`x-rxfy-session` header).
2. Whatever serves data also records the subscription: `live.serve(req, state, params, data)` — a **pass-through** that returns `data` unchanged — writes the served entities and state channel into the hub under the requester's session. SSR does the same for the whole render via `live.hydration(registry)`.
3. Writes are unchanged (`live.create/update/delete`, `touch`): the hub fans each patch/stale out to every session that was served the affected topic or channel.
4. The client is a pure sink: apply patches to stores, bump channel counters. Its complete outbound protocol is one `hello` frame.

**Deleted outright:** `createTopicKeyer`, `RXFY_SECRET`, `grant`, `GrantSpec`, `Grants`, hashed subscription ids, subscribe/unsubscribe protocol frames, hydration grants, `readSsrGrants`, `addGrants`, and all client-side subscription wiring. The word "grant" leaves the codebase.

**Security model unchanged in substance:** a client receives updates only for data the server chose to serve it. There is no subscription request to authorize because there is no subscription request.

Revision history: v1 of this spec auto-derived grants but kept them in HTTP response envelopes (rejected: forces a response shape on every endpoint); v2 delivered grants over the WebSocket correlated by session (rejected: the token round-trip exists only so the client can ask for what the server already decided it may have). v3 removes the ask.

---

## Background

Grants exist for exactly one reason: entity `patch` messages carry the full row ([packages/rxfy-server/src/server.ts](../../../packages/rxfy-server/src/server.ts) `publishEntity`), so a subscription is data access, so subscriptions needed a gate — an unguessable token minted per served topic. Everything else in the grant flow (keyer windows, token expiry, `addGrants`, the four places application code declares grant inputs) is ceremony serving that gate.

Inverting control removes the need for the gate: if the server writes the subscription table itself at serve time, the client holds no capability and requests nothing. The hub already keeps exactly this table — `hub.subscribe(conn, ids)` / `hub.publish(id, message)` — today populated by client frames carrying granted tokens. This design changes only *who writes it* and keys it by session instead of raw socket.

Two supporting facts from the current code:

- The client's subscription *intent* was already fully derivable (`registry.added$`, `stateChannel`) — grants were only a token lookup. Dropping client subscriptions loses nothing.
- The client never unsubscribes today ([packages/rxfy-react/src/live/live-client.ts](../../../packages/rxfy-react/src/live/live-client.ts) only grows its sets), so per-session accumulation server-side is not a regression — the same set moves to where TTLs and caps can actually be enforced.

The channel derivation is currently duplicated (`rxfy-react/src/live/channel.ts`, `rxfy-server/src/state-channel.ts`) with "MUST stay identical" comments; this design also consolidates it.

---

## Design

### 1. Protocol v2 (`rxfy-protocol`)

```ts
// client → server, sent after every (re)connect. The only client frame.
export type HelloMessage = { v: ProtocolVersion; kind: "hello"; session: string };
```

- `ClientMessage` becomes just `HelloMessage`; `SubscribeMessage`/`UnsubscribeMessage` are deleted.
- `ServerMessage` (`patch`, `stale`) is unchanged, except `patch`/`stale` now travel with raw names end to end.
- `PROTOCOL_VERSION` bumps to 2.
- New exported constant `RXFY_SESSION_HEADER = "x-rxfy-session"`.

Session-id security: the id is a bearer correlator — whoever presents it receives that session's pushes. It never appears in URLs or HTML attributes (hydration script content only), travels in same-origin headers and WS frames, and is fresh per page load. Documented as "treat like a session cookie."

### 2. Hub: session-keyed, server-written (`rxfy-server`)

The hub keeps its shape but is re-keyed and gains lifecycle:

```ts
export type SessionId = string;                       // replaces ConnId (number)
export type Hub = {
  subscribe: (session: SessionId, ids: string[]) => void;   // called by the SERVE path, not by WS frames
  unsubscribe: (session: SessionId, ids: string[]) => void;
  publish: (id: string, message: ServerMessage) => void;
  onPublish: (sink: (session: SessionId, message: ServerMessage) => void) => void;
  /** Socket liveness, driven by the WS layer. Unbound sessions expire after ttlMs. */
  bind: (session: SessionId) => void;
  release: (session: SessionId) => void;
  drop: (session: SessionId) => void;
};
export function createInMemoryHub(options?: { ttlMs?: number }): Hub;   // default ttl: 5 minutes
```

- Subscription ids are raw names, internally prefixed to keep the namespaces disjoint: entities `e:${name}:${id}`, channels `c:${channel}` (prefixing is invisible outside the hub/server).
- TTL sweep: a session with no bound socket (never connected, or disconnected) is dropped `ttlMs` after its last `subscribe`/`release`. A `bind` cancels expiry. This covers both SSR-minted sessions whose client never arrives and closed tabs.

### 3. Serving = subscribing (`rxfy-server`)

`createServer({ db, resources, hub })` — the `keyer` config field is deleted. Two serve-path methods:

```ts
serve: <TParams, TShape>(
  req: string | { headers: { get(name: string): string | null } },   // session id, or a fetch-API Request
  state: StateDescriptor<TParams, TShape, any, any, any>,
  params: TParams,
  data: TShape,
) => TShape;                                    // returns data unchanged

hydration: (registry: IModelRegistry) => string; // mints a session, records the render, returns the hydration script
```

`serve` behavior:

1. Resolve the session id (`req` string as-is, or `req.headers.get(RXFY_SESSION_HEADER)`); if absent (curl, server-to-server), return `data` untouched — serving without a session is valid and record-free.
2. Normalize `data` into a throwaway registry (`normalizeResult(registry, state.fields, data)`); record `stateChannel(state, params)` (skipped for keyless states).
3. Derive raw names via the shared derivation (section 5) and `hub.subscribe(session, names)`.
4. Return `data`.

```ts
// endpoint keeps its route and response shape entirely
const rows = await db.select().from(todos).orderBy(...);
return c.json(live.serve(c.req.raw, todosState, {}, { todos: rows }));
```

`hydration` behavior: mint `session = crypto.randomUUID()`, derive names from the *render* registry (entities from stores matched to resources, channels from the registry's channel log), `hub.subscribe(session, names)`, return `hydrationScript({ ...dehydrate(registry), session })`. The hydration payload's `grants` field is replaced by `session?: string` (`rxfy` core).

Publishing (`publishEntity`, `applyTouch`) drops the keyer loop and publishes once on the raw prefixed name. `touch` and `invalidationChannel` survive unchanged; `state-channel.ts` becomes a thin wrapper over the core `stateChannel` (section 5). **Deleted:** `grant`, `GrantSpec`, `Grants`, `createTopicKeyer`, the keyer module.

### 4. WS layer (`rxfy-ws`)

**Server** — `createWsServer(hub)`:

- On a `hello` frame: map `session → socket`, `hub.bind(session)`. A re-hello (reconnect) rebinds; pushes resume immediately since the hub records survived.
- `hub.onPublish((session, message) => sockets.get(session)?.send(serialize(message)))`.
- On close: `hub.release(session)` (starts the TTL clock); the socket map entry is removed.
- No subscribe-frame handling — inbound parsing accepts only `hello`.

**Client** — `ClientTransport` becomes `{ hello: (session: string) => void; onMessage; close }`. `createWsClient` remembers the last session and replays `hello` on every reconnect (replacing today's active-set replay).

### 5. Shared derivation in `rxfy` core

Kept from the earlier revisions — the substrate both serve paths use:

- **`stateChannel`** moves to `packages/rxfy/src/state/channel.ts` as the single canonical implementation (same algorithm as today's duplicated copies). `rxfy-react` and `rxfy-server` import it; the "MUST stay identical" comments die.
- **`ChannelLog`** on the registry (`registry.channels`, a `Set`-backed `{ add, all }`): recorded by `useStateData` during SSR (`if (isServer && ssr && channel) registry.channels.add(channel)`) and by `serve`'s throwaway registry. Idempotent under StrictMode double renders.
- **Entity derivation** (`rxfy-server`, internal): match registry stores to resources by model identity (`resource.model._key`), mint `name:id` per loaded entry from `resource.name` (the authoritative publish namespace). Models without a backing resource are skipped — client-only models stay local.

### 6. Client becomes a sink (`rxfy-react`)

```ts
createLiveClient({ registry, transport, session }): LiveClient   // grants option deleted
```

- Sends `transport.hello(session)`; the transport re-hellos on reconnect.
- `onMessage`: `patch` → `registry.namedStores().get(name)?.set(id, data)` (unchanged); `stale` → bump the channel counter (unchanged).
- **Deleted:** `entityIds`/`channelIds`, `subscribeTopic`/`subscribeChannel`, the `added$` subscription, `addGrants`, `readSsrGrants`, the `Grants` type.
- `channel()` counters stay — they are local bookkeeping for `updatesAvailable$`/`applyUpdates`.
- New helper `readSsrSession(): string | undefined` — reads `session` from the SSR hydration chunks (replaces `readSsrGrants`).
- The `added$` doc comment in `rxfy` core is updated (it no longer drives live subscriptions); the API itself stays.

### 7. Template simplification (`templates/vite`)

| File | Change |
| --- | --- |
| `src/session.ts` (new) | `export const sessionId = readSsrSession() ?? crypto.randomUUID()` — SSR-adopted or self-generated, one per page load. |
| `src/api-client.ts` | `hc<AppType>("/api", { headers: { [RXFY_SESSION_HEADER]: sessionId } })`. `fetchTodos` client branch becomes a plain `return res.json()`; the `{ data, grants }` cast and `addGrants` call are deleted. SSR branch (direct DB read) unchanged. |
| `src/live-singleton.ts` | **Deleted.** |
| `src/entry-client.tsx` | `createLiveClient({ registry, transport, session: sessionId })`. |
| `src/entry-server.tsx` | `resolve({ html, state: live.hydration(registry) })`; drop `routeStates`, `todoResource`, `dehydrate`, `hydrationScript` imports and the unused `pathname`. |
| `src/routes.ts` | Delete `routeStates`. Keep `todosChannel` (still used by `touch` targets). |
| `server/live.ts` | `createServer({ db, resources, hub })` — keyer and `RXFY_SECRET` gone. |
| `server/api.ts` | GET `/todos`: `return c.json(live.serve(c.req.raw, todosState, {}, { todos: rows }))`. Write endpoints (`touch(todosChannel, {})`) unchanged. |

What deliberately survives in app code:

- One `live.serve` pass-through per read endpoint — the server cannot see what a plain Drizzle read served without it. (Framework-owned state endpoints — zero endpoint code — were considered and deferred as a separate, larger design.)
- `touch(todosChannel, {})` on writes and the `todosChannel` cast — only the app knows which lists a write invalidates.
- One header line at fetch-client setup.

---

## Edge cases

- **Fetch completes before the WS connects** — the hub record exists regardless of socket state; pushes begin once `hello` binds. No ordering requirement.
- **Reconnect** — re-`hello` rebinds; records survived (TTL), pushes resume. Updates published *while disconnected* are lost — same as today's behavior; recovery remains refetch (`reload`/`applyUpdates`). A catch-up/resync protocol is an explicit follow-up, out of scope.
- **SSR session never claimed** — client JS disabled or navigation abandoned: the unbound session's records expire after `ttlMs`.
- **Request without a session header** — `serve` returns data untouched, records nothing.
- **Keyless states** — `stateChannel` returns `undefined`; no channel recorded (matches current behavior).
- **Windowed params** — `stateChannel` strips `state.window` keys; every page of a partition records the same channel; the hub set dedups.
- **Entity/channel name collision** — prevented structurally by the internal `e:`/`c:` prefixes.
- **`resource.name` ≠ `model.name`** — subscriptions and publishes both use `resource.name`; consistent by construction.
- **Two tabs** — separate page loads, separate sessions, independent record sets.
- **Multi-node deployment** — the HTTP node that records a subscription may differ from the node holding the socket. Server-held subscriptions therefore require a shared (or sticky) hub across nodes — the same constraint the in-memory hub already imposes; a shared-backend hub (e.g. Redis) remains the existing follow-up path and its interface is unchanged by this design.
- **Session hijack surface** — an attacker presenting a captured session id receives that session's pushes. Comparable to session-cookie exposure; documented. Initial data reads still pass through the HTTP API's own auth.

---

## Testing

**Unit**

- `rxfy`: `stateChannel` (port existing channel tests to core), `ChannelLog` add/all/idempotency, hydration payload `session` round-trip (replacing the grants round-trip test).
- `rxfy-protocol`: `hello` constructor/parser; subscribe/unsubscribe parsers removed; version bump round-trip.
- `rxfy-server`: hub — server-written subscribe, publish fan-out per session, bind/release/TTL expiry, prefix disjointness; `serve` — returns data unchanged, records under the right session, no-session no-op, keyless state no channel, resource-less models skipped; `hydration` — mints a session, records the render registry, script carries `session` + dehydrated state.
- `rxfy-ws`: `hello` binds and rebinds; close releases; pushes reach the bound socket; unknown frames ignored.
- `rxfy-react`: live client sends `hello` on (re)connect; patches/stales apply as before; `readSsrSession` reads the payload; SSR render records channels into `registry.channels`.

**Integration** — template smoke tests must pass with the new wiring:

- `templates/vite/src/ssr.smoke.test.ts` — hydration payload carries `session` (not grants).
- `templates/vite/server/live.smoke.test.ts` — end to end: SSR render → hello → `live.update` patch received; API fetch with session header → `touch` → stale received.

---

## Release

Changesets (per repo policy, before the PR). Per the maintainer's decision, the removals ship as **minor** releases, not semver-major:

- `rxfy` — minor: `stateChannel`, `ChannelLog`/`registry.channels`, hydration `session` field (grants field removed).
- `rxfy-protocol` — minor: protocol v2, `hello` frame, subscribe/unsubscribe removed, `RXFY_SESSION_HEADER`.
- `rxfy-ws` — minor: hello-only server, session-replaying client transport.
- `rxfy-server` — minor: session-keyed hub with TTL, `serve`, `hydration`, keyer/grant machinery removed.
- `rxfy-react` — minor: sink-only live client, `session` option, `readSsrSession`, `readSsrGrants`/`addGrants` removed, SSR channel recording, channel helper re-exported from core.

Docs/skills referencing grants, `routeStates`, `live.grant`, or `createTopicKeyer` (e.g. `.claude/skills/rxfy-framework/references/grants-hydration.md`, `framework-server.md`, `apps/docs`) are updated in the same PR.
