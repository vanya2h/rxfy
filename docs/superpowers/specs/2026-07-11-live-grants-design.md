# Live Grants: stateless JWT channel grants on the data plane (protocol v2)

**Date:** 2026-07-11
**Status:** Approved
**Replaces (pre-release):** [2026-07-08-auto-grants-design.md](2026-07-08-auto-grants-design.md) — the session design never shipped; this design takes protocol v2.

## Summary

Replace server-held sessions with **stateless, signed channel grants delivered inside the served payload**. The server records nothing at serve time — it signs. The client holds the grants, subscribes with them, and replays them on reconnect.

1. `live.serve(state, params, data)` returns the parsed shape plus a reserved `$grant` field — a JWT whose claims are the state's canonical channel (`stateChannel(state, params)`) and an expiry. One token per served state instance, riding the **data plane**: any fetcher, any RPC wrapper, any transport works, because the grant is just a field in the data.
2. The client lifts the grant automatically: `useStateData`'s `fetchFn` already returns the payload to the framework, so the live client strips `$grant` before normalization and subscribes — **zero integrator plumbing**. No session header, no fetch wrapping, no correlator race: grant delivery is atomic with the data it covers.
3. A `subscribe` frame carries the grant plus the entity ids the payload normalized into (`{ grant, entities }`). The channel subscription is authorized by the token; entity subscriptions use **raw ids**, gated on the accompanying token being currently valid.
4. Writes are unchanged (`live.create/update/delete`, `touch`): the WS node fans each patch/stale out to every socket subscribed to the affected topic — subscription state is socket-keyed and dies with the socket.
5. Grants expire. The client renews them through an app-mounted endpoint that runs the app's own auth middleware — **revocation latency collapses to the token TTL**.

**Deleted from v2:** session ids, `RXFY_SESSION_HEADER`, `getSessionId`/`sessionHeaders`/`withSession`, the `hello` and `session` frames, session-keyed hub state, and the bind/release TTL lifecycle. The word "grant" re-enters the codebase — deliberately: this design keeps v2's _automatic derivation_ of what to subscribe to, and restores v1's _capability_ delivery, minus the per-entity token explosion that killed v1.

**The deciding constraint:** entity patches carry full rows and fan out on raw-id topics, so **entity ids MUST be unguessable**. This design converts an existing convention (the templates mint `crypto.randomUUID()`) into a hard framework requirement. If that mandate is unacceptable, sessions (v2) remain the right design.

---

## Background

v2 (sessions) shipped with three structural costs, none fatal alone:

- **The correlator race** — client-only loads have no session until the server assigns one over the WS (`session` frame), so first-mount fetches race the socket round-trip and lose: served, but never recorded, silently not live.
- **The fetcher tax** — every HTTP client must inject `x-rxfy-session` (`withSession`/`sessionHeaders`). Integrators whose fetch path doesn't expose per-request headers (generated clients, framework data layers) cannot comply at all; forgetting it fails silently.
- **Server-held state** — the in-memory hub does not survive restarts (subscriptions silently vanish; clients reconnect into an empty hub) and requires a shared or sticky hub across nodes.

The v2 spec's revision history rejected response-delivered grants ("v1: forces a response shape on every endpoint") when grants were **per-entity** — a 100-row page meant 100 tokens in the body. Two observations dissolve that rejection:

- Grants can be **state-wide**: one token per served state instance covers the channel. Entities delivered by that state don't need individual tokens _if_ their ids are unguessable — possessing an id proves it was served by some authorized state fetch.
- The state payload is already framework-shaped: `live.serve` **parses** it (brands ids, strips unknown keys). Endpoints that call `live.serve` are rxfy-aligned by construction; one reserved field in that payload is not a new intrusion, and it is confined to exactly those endpoints.

What v2 got right and this design keeps: subscription _intent_ derived server-side from what was actually served (no application-declared grant specs, no keyer), the canonical `stateChannel` derivation in core, `ChannelLog`, entity derivation via the resource registry, and unchanged write/publish semantics.

---

## Design

### 1. Protocol v2 (`rxfy-protocol`)

```ts
// client → server. The only client frame. Sent per served state, replayed in bulk on reconnect.
export type SubscribeMessage = {
  v: ProtocolVersion; // 2
  kind: "subscribe";
  grant: string; // JWT: { ch: string, exp: number }
  entities: string[]; // raw `${name}:${id}` topics the payload normalized into
};
```

- `ClientMessage` becomes just `SubscribeMessage`; `HelloMessage` is deleted.
- `ServerMessage` (`patch`, `stale`) is unchanged; the `session` frame is deleted.
- `PROTOCOL_VERSION` stays `2` — the session protocol never shipped, so v2 is ours to define. `RXFY_SESSION_HEADER` is deleted.

### 2. Grants (`rxfy-server`)

- **Format:** JWT, HS256, signed with `RXFY_SECRET` (returns as a required `createServer` config or env var). Claims: `ch` (canonical channel), `exp` (default TTL 15 minutes), `iat`.
- **Minting:** `serve` signs `stateChannel(state, params)`. `hydration` signs one grant per channel in the render registry's `ChannelLog`.
- **Verification:** signature + `exp` only. The server does **not** verify entity∈state membership — statelessly it cannot. The gate for entity topics is the conjunction of (a) a currently-valid grant in the same frame and (b) unguessable ids (see Security).

### 3. Serving = signing (`rxfy-server`)

`serve` loses its `req` parameter — there is no session to resolve:

```ts
serve: <TParams, TShape, TShapeInput>(
  state: StateDescriptor<TParams, TShape, ...>,
  params: TParams,
  data: TShapeInput,
) => TShape & { $grant: string };

hydration: (registry: IModelRegistry) => string;  // hydration script; payload carries grants: string[]
renew: (grant: string) => string;                 // verify (with grace window) → reissue; app mounts it behind auth
```

`serve` behavior: parse `data` through the field schemas (unchanged from v2's final form), sign the channel, return the parsed shape with `$grant` attached. **No hub interaction.** A consumer that ignores `$grant` (curl, server-to-server) just sees one extra string field.

`renew` behavior: verify the presented grant's signature, accepting tokens expired less than a grace window (default 5 minutes); reissue with a fresh `exp`. The app mounts it as an endpoint **behind its own auth middleware** — this is where revocation actually bites: a user whose access was withdrawn fails the middleware, the reissue never happens, and their live updates end at `exp`.

```ts
// endpoint — no req, no header, no session
const rows = await db.select().from(todos).orderBy(...);
return c.json(live.serve(todosState, {}, { todos: rows }));

// renewal — one line, app auth applies
app.post("/live/renew", authed, async (c) => c.json({ grant: live.renew((await c.req.json()).grant) }));
```

### 4. Hub: socket-keyed, expiry-aware (`rxfy-server`)

The hub re-keys by connection and its lifecycle collapses into the socket's:

```ts
export type ConnId = number;
export type Hub = {
  subscribe: (conn: ConnId, ids: string[], exp: number) => void; // called by the WS layer on a verified frame
  publish: (id: string, message: ServerMessage) => void; // skips entries past exp (lazy prune)
  onPublish: (sink: (conn: ConnId, message: ServerMessage) => void) => void;
  drop: (conn: ConnId) => void; // socket closed
};
```

- `bind`/`release`/TTL are deleted — an unclaimed subscription cannot exist (subscribing requires a live socket), and a closed socket's state is dropped immediately. The client owns durability by re-subscribing.
- Entries carry the grant's `exp`; `publish` skips expired entries and a periodic sweep removes them. A re-`subscribe` with a fresh grant extends `exp` in place.
- Internal `e:`/`c:` prefixes survive unchanged.

### 5. WS layer (`rxfy-ws`)

**Server** — on a `subscribe` frame: verify the grant (signature, `exp`); on success `hub.subscribe(conn, [channel, ...entities], exp)`; on failure send nothing and drop the frame (the client's renewal loop is the recovery path). On close: `hub.drop(conn)`.

**Client** — `ClientTransport` becomes `{ send: (msg: ClientMessage) => void; onMessage; close }`. `createWsClient` buffers frames while disconnected and replays the **current grant set** (not the historical frame log) on reconnect.

### 6. Client: grant custody (`rxfy-client`)

`createLiveClient({ registry, transport })` — the `session` option is deleted. The client keeps a map `channel → { grant, exp, entities }`:

- **Intake:** `useStateData` (and the SSR hydration path via `readSsrGrants`) hands the client each lifted `$grant` with the entity topics its payload normalized into. The client sends `subscribe` and records the entry. Client-only first fetches subscribe the moment the socket opens — no ordering requirement, no race.
- **Renewal loop:** one timer per client (not per grant): at ~80% of the soonest `exp`, POST the expiring grants to the renewal endpoint (URL supplied by config: `renewUrl`), replace them, re-`subscribe`. A failed renewal (401 — access revoked; or secret rotated) drops the entry: updates for that state end, data goes quietly static, and the standard recovery is a refetch (which returns a fresh grant or an error).
- **Reconnect:** replay every live entry's `subscribe`. Updates published while disconnected are lost — recovery remains refetch (`reload`/`applyUpdates`), unchanged from v2.
- **Deleted:** `getSessionId`, `sessionHeaders`, `withSession`, `readSsrSession`. **New:** `readSsrGrants(): string[]`.
- Patch/stale handling is unchanged: patches set store cells, stales bump channel counters.

### 7. `useStateData` lift (`rxfy-react`)

After `fetchFn` resolves: strip `$grant` if present, normalize the rest (unchanged), derive the entity topics from the normalized result, hand `{ grant, entities }` to the live client. Both halves are conditional: a payload without `$grant` (the endpoint doesn't call `live.serve`) lifts nothing and the state is simply not live; a context without a live client drops the grant after stripping it. Store-only apps — `rxfy` + `rxfy-react` with no live packages — hit neither branch and are untouched by this design. SSR renders record channels into `ChannelLog` exactly as today; `hydration` signs them into the payload.

### 8. Template simplification (`templates/vite`)

| File                   | Change                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `src/api-client.ts`    | Plain `hc<AppType>("/api")` — the lazy `sessionHeaders` wiring is deleted.                         |
| `src/entry-client.tsx` | `createLiveClient({ registry, transport, renewUrl: "/api/live/renew" })`.                          |
| `server/api.ts`        | `live.serve(todosState, {}, { todos: rows })` — no `c.req.raw`. Plus the one-line renew route.     |
| `server/live.ts`       | `createServer({ db, resources, secret })` — the hub config entry is gone (internal, socket-keyed). |

What survives in app code: one `live.serve` per read endpoint, `touch` targets on writes, and one mounted renew route. The fetch client carries **nothing**.

---

## Security

- **Opaque entity ids are a hard requirement — scoped to live.** Full-row patches fan out on raw `name:id` topics; with guessable ids (serial integer PKs) any valid grant lets a client watch arbitrary rows. The mandate covers exactly the models whose rows are published — resource-backed models written through `live.*` in a live-enabled app. Store-only apps, client-only models, and non-live states impose nothing on ids. Note the scope is _published models_, not _live states_: a model written via `live.create/update` publishes patches even if no state serving it ever calls `live.serve`, so its ids must be opaque regardless. Templates already comply (`crypto.randomUUID()`). Dev-mode heuristic: warn when a resource-backed model's ids are short decimal integers.
- **A leaked grant is a capability until `exp`** — it authorizes receiving pushes for one channel (and presenting alongside entity subscriptions). Mitigations: short TTL, renewal behind app auth, and grants never appear in URLs. State endpoints should send `Cache-Control: private, no-store` — a cached personalized response already leaks a data snapshot, but with grants it would leak a live capability; the docs must say so explicitly.
- **Possession of an id outlives access** in the window between revocation and `exp`: a revoked user holding a still-valid grant can resubscribe to known entity ids until the token dies. Bounded by TTL; apps needing tighter revocation use shorter TTLs.
- **Secret rotation** invalidates all outstanding grants at once: renewals fail, clients degrade to static data, refetches mint fresh grants. Graceful by construction; no restart choreography.

---

## Edge cases

- **Fetch completes before the WS connects** — the client queues the subscribe; grants are client-held, so nothing is lost. No ordering requirement (now including client-only first fetches, which v2 raced).
- **Server restart** — sockets drop, clients reconnect and replay their grant set; subscription state is rebuilt from the client side. v2 lost it silently.
- **Multi-node** — any node verifies a grant with the shared secret; subscription state lives on the node holding the socket. No shared or sticky hub. (Cross-node _publish_ fan-out — a write on node A reaching a socket on node B — still needs a pub/sub backbone; that is orthogonal to subscription state and unchanged from v2's follow-up.)
- **Grant expires with the tab open** — the renewal loop reissues ahead of `exp`; if renewal fails, that state's updates end and data goes static until refetch. No crash, no error surface beyond a dev-mode console warning.
- **Windowed params** — every page of a partition signs the same channel (window keys stripped by `stateChannel`); the client dedups by channel, keeping the freshest grant.
- **Two tabs** — independent clients, independent grant sets; no shared-session semantics to preserve (v2's per-page-load sessions had the same property via different means).
- **Duplicate subscribes** — re-subscribing an already-subscribed topic extends `exp`; idempotent by construction.
- **`serve` without a socket ever connecting** — nothing was recorded anywhere; the grant simply expires client-side. (v2 needed the TTL sweep for exactly this.)
- **Non-live states in a live app** — a state fetched from an endpoint that doesn't call `live.serve` carries no `$grant` and never subscribes: static data, refetch semantics unchanged. If it shares entities with a live state, the shared store cells still receive patches — normalization working as intended, identical to v2.
- **Store-only apps** — `rxfy` + `rxfy-react` without the live packages see no `$grant`, no subscribe path, no id constraints. This design changes nothing below the live stack.

---

## Trade-offs vs the session design

| Axis                           | Sessions (superseded pre-release)                                | Grants (this spec)                                         |
| ------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Server state at serve time     | Hub write per serve                                              | None — sign only                                           |
| Restart / multi-instance       | In-memory hub: lost / sticky-or-shared                           | Client-held: rebuilt on reconnect / any node verifies      |
| Integrator fetch path          | Must inject header (`withSession`) — infeasible for some clients | Nothing — grant rides the data                             |
| First-fetch race (client-only) | Present                                                          | Structurally impossible                                    |
| Schema constraints             | None                                                             | **Entity ids must be unguessable**                         |
| Client machinery               | Pure sink + one `hello`                                          | Subscribe frames, grant custody, renewal loop              |
| Revocation                     | Drop the session (immediate)                                     | Bounded by token TTL (renewal gate)                        |
| Protocol                       | 1 client frame, no crypto                                        | 1 client frame, JWT verify per subscribe                   |
| Payload                        | Untouched                                                        | One reserved `$grant` field on framework-aligned endpoints |

The v2 spec's "the ask is ceremony" argument does not survive this revision: the ask now buys statelessness. What remains true is that v2 imposes nothing on schemas — that is the axis on which the decision lives.

---

## Testing

**Unit**

- `rxfy-protocol`: `subscribe` constructor/parser; hello/session parsers removed; v2 round-trip.
- `rxfy-server`: grant sign/verify/expiry/grace; `serve` returns parsed shape + valid `$grant`, no hub interaction; `renew` reissues within grace, rejects beyond; hub — socket-keyed subscribe/publish/drop, lazy expiry prune, `exp` extension on re-subscribe.
- `rxfy-ws`: verified subscribe reaches the hub; invalid/expired grants dropped; close drops the conn; reconnect replay.
- `rxfy-client`: grant intake from lifted payloads and `readSsrGrants`; renewal loop timing and failure degradation; reconnect replays the current set; patch/stale unchanged.
- `rxfy-react`: `useStateData` strips `$grant` before normalization and hands entities to the client; SSR channel recording unchanged.

**Integration** — template smoke tests:

- `templates/vite/src/ssr.smoke.test.ts` — hydration payload carries `grants` (not `session`).
- `templates/vite/server/live.smoke.test.ts` — end to end: SSR render → subscribe replay → `live.update` patch received; client-only fetch → auto-subscribe → `touch` → stale received; expired grant → renewal → pushes continue.

---

## Release

Protocol v2 (redefined pre-release — the session protocol never shipped) is a breaking change across the live stack relative to published 2.0.0; these land as **major** changesets: `rxfy` (hydration payload `grants` field), `rxfy-protocol` (v2 subscribe frame), `rxfy-ws` (subscribe verification), `rxfy-server` (stateless serve, `renew`, socket-keyed hub, `RXFY_SECRET`), `rxfy-client` (grant custody, session helpers removed), `rxfy-react` (`$grant` lift).

## Open questions

1. **Renewal transport** — dedicated endpoint (this spec) vs piggybacking on any state refetch (a refetch already returns a fresh grant; a renew endpoint only avoids refetching data). Start with the endpoint; revisit if apps end up refetching anyway.
2. **Grace window semantics** — whether `renew` accepting recently-expired tokens weakens the revocation bound enough to matter (it extends worst-case revocation to TTL + grace).
3. **Entity topic hashing as an opt-in** — `HMAC(name:id)` topics would lift the opaque-id mandate at the cost of per-entity tokens in the payload (v1's envelope, opt-in per model for apps stuck with serial ids). Deferred unless the mandate proves adoption-blocking.
