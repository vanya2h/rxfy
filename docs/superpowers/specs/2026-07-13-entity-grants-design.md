# Entity Grants: bind entity ids into the signed grant (protocol v2, amended)

**Date:** 2026-07-13
**Status:** Approved
**Amends (pre-release):** [2026-07-11-live-grants-design.md](2026-07-11-live-grants-design.md) — same protocol v2, folded into the same unreleased 3.0.0 major. No v3.

## Summary

The live-grants design authorizes the **channel** with the signed grant but accepts **entity** subscriptions on raw `name:id` topics gated only on _some_ valid grant accompanying them. Any grant-holder can therefore subscribe to any entity id they can guess, which is why that design had to mandate unguessable ids ("entity ids MUST be UUIDs").

This amendment closes that gap by making the grant the **complete, server-authoritative capability**: `serve` already knows the exact entity set at sign time (it parses the payload that normalizes into those topics), so it signs those topics into the grant. The client stops sending an entity list; it forwards the grant, and the WS server subscribes to exactly the channel plus entities the grant names — nothing the client asks for out of band.

Consequences:

- **The "ids MUST be unguessable" mandate is removed.** Serial integer ids are safe again; a grant authorizes a fixed, signed set of entities and nothing else.
- **No new per-message bloat on subscribe/reconnect.** The entity id list already travelled on the v2 `subscribe { grant, entities }` frame in plaintext; this design _relocates_ it into the signed token (marginal cost: base64 inflation + one signature), it does not add it.
- **The client stops computing subscription topics.** `collectEntityTopics` moves server-side into `serve`; the client only ever forwards grants.
- **SSR hydration stops re-signing.** The grant `serve` already produced (entities included) is logged during render and embedded verbatim; `grantsHydration` no longer needs the secret, and only genuinely-live states emit grants.

The stateless-server property is preserved end to end: the server still records nothing at serve time, the grant remains self-describing, and reconnect durability is still client-owned replay.

---

## Background

The live-grants spec's deciding constraint was: _"entity patches carry full rows and fan out on raw-id topics, so entity ids MUST be unguessable."_ That converts a security property into an operational discipline enforced nowhere in the framework — a leaked id (URL, referrer, log line, error payload) grants any authenticated user TTL-bounded, renewable read access to that row.

The escape was always available and was simply not taken: **`serve` has the entity set in hand.** It parses `data` into the state shape; the same walk that the client runs (`collectEntityTopics`) to discover topics can run on the server against the parsed payload, because the field schemas carry the model descriptors (`model.name`, `model.getKey`). Signing those topics into the grant makes the client's entity list redundant — and, once redundant, untrusted input we can drop.

The live-grants revision history rejected per-entity tokens (a 100-row page → 100 tokens). That rejection does not apply here: this is still **one token per served state**, the token just enumerates its entities in a single `ents` claim.

---

## Design

### 1. Grant claims carry entities

`grant.ts` (`rxfy-server`):

```ts
export type GrantClaims = { channel: string; entities: string[]; exp: number };
// wire payload: { ch: string, ents: string[], exp: number }
```

- `signGrant({ channel, entities, secret, ttlMs, now? })` writes `ents` into the payload.
- `verifyGrant` returns `entities`; a payload whose `ents` is not a `string[]` fails verification (returns `null`), same as a bad `ch`/`exp`.
- HMAC-SHA256, length-guarded `timingSafeEqual`, verify-before-parse, and the renewal grace window are all unchanged.

### 2. `serve` extracts and signs the entity set

`server.ts`:

```ts
serve(state, params, data) {
  const parsed = parseShape(state.fields, data);
  const channel = stateChannel(state, params);
  if (!channel) throw new Error("rxfy-server: serve requires a keyed state");
  const entities = collectEntityTopics(state.fields, parsed);
  return { ...parsed, $grant: signGrant({ channel, entities, secret, ttlMs: grantTtlMs }) };
}
```

- `collectEntityTopics` moves from `rxfy-react` into `rxfy` core so both server (`serve`, on the parsed full-entity shape) and any remaining core caller can use it. It walks `fields`: for a `single(model)` field it emits `\`${model.name}:${model.getKey(entity)}\``; for an `array(model)` field it emits one topic per element. No registry needed — the field schema carries the model refs.
- The non-null channel assertion becomes an explicit throw (a keyless state can never be served live).

### 3. Protocol frame drops `entities`

`messages.ts` / `codec.ts` (`rxfy-protocol`):

```ts
export type SubscribeMessage = { v: ProtocolVersion; kind: "subscribe"; grant: string };
export const subscribe = (grant: string): SubscribeMessage => ({ v: PROTOCOL_VERSION, kind: "subscribe", grant });
```

`parseClientMessage` validates only `grant: string`; the `entities` validation is removed. `PROTOCOL_VERSION` stays `2` (pre-release amendment).

### 4. WS server trusts only the grant

`ws/server.ts`:

```ts
const claims = verifyGrant(frame.grant, { secret: options.secret });
if (claims === null) return;
const ids = [channelSubscription(claims.channel), ...claims.entities.map(entityTopicSubscription)];
hub.subscribe(conn, ids, claims.exp);
```

No client-supplied topic ever reaches the hub. A socket receives patches only for entities its own presented grants enumerate.

### 5. Client forwards grants only

`live-client.ts` (`rxfy-client`):

- `subscribe(grant: string)` — the `entities` parameter is gone. The client decodes the grant for bookkeeping (`ch`, `exp`) exactly as today; it no longer merges or tracks entity lists.
- The subscribe frame is `subscribeFrame(grant)`.
- SSR intake collapses to `readSsrGrants().forEach((g) => client.subscribe(g))`. The "first grant carries all hydrated topics" block and its walk over `registry.stores()` are deleted — each grant self-describes.

`useStateData.ts` (`rxfy-react`):

- Both the fetch-settle and default-data paths still lift `$grant` before normalization, then call `liveClient.subscribe($grant)`. The `collectEntityTopics(fields, query)` call at each subscribe site is removed.

### 6. SSR hydration reuses the served grant

`channel-log.ts` (`rxfy`) becomes a **grant log**:

```ts
export type GrantLog = { add: (grant: string) => void; all: () => string[] };
```

- `useStateData`'s SSR settle path stashes the `$grant` it received (`registry.grants.add($grant)`) instead of adding a bare channel. Only states that actually served a grant (live ones) are logged — tighter than today, which logged every keyed SSR state's channel.
- `grantsHydration(registry)` embeds `registry.grants.all()` verbatim: `hydrationScript({ ...dehydrate(registry), grants })`. **The `secret` and `ttlMs` options are dropped** — hydration no longer signs. `createServer`'s `live.hydration(registry)` wrapper is unchanged in signature.
- TTL is measured from serve time rather than render-end; the gap is sub-second against a 15-minute TTL and is accepted.

### 7. `renew` carries entities forward

`server.ts`:

```ts
renew(grant) {
  const claims = verifyGrant(grant, { secret, graceMs: renewGraceMs });
  return claims === null
    ? null
    : signGrant({ channel: claims.channel, entities: claims.entities, secret, ttlMs: grantTtlMs });
}
```

Renewal reissues the same channel + entity set with a fresh expiry.

### 8. Security posture

- The breaking-change warning "🔒 Entity ids MUST be unguessable" is **removed** from the changeset and docs. A grant authorizes a fixed signed entity set; guessing an id grants nothing.
- `Cache-Control: private, no-store` on state endpoints stays as ordinary response hygiene (a served payload still contains a bearer grant), no longer as a load-bearing mitigation.

---

## Traffic profile

The grant's entity list scales with entity count; it matters on exactly one plane.

| Plane                               | When                     | Cost                                                                                                                                               |
| ----------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serve → client (data)               | once per fetch           | Grant lists **ids**; payload carries **full rows**. Grant is strictly smaller than the data it rides with.                                         |
| Client → WS (subscribe / reconnect) | per sub + each reconnect | The id list **already travelled here** as `frame.entities` in v2. Marginal cost = base64 (~33%) + one signature. Not newly massive.                |
| Renew (HTTP)                        | every ~TTL (~15 min)     | The **only** genuinely new cost: entities now ride the renew round-trip (v2 renewal did not carry them). Bounded by a highly compressible id list. |

Mitigations:

- **Enable WebSocket `permessage-deflate`** (deployment default, noted in templates). A JWT of repeated `name:uuid` strings compresses ~5–10×; a 2000-entity grant is ~90 KB raw, ~10–15 KB compressed, once per TTL. The target workloads (lists in the dozens) are ~1 KB.
- **Accept unbounded entity counts** per grant (decided). No cap, no warning; revisit only if a real large-feed workload appears.

### Documented escape hatch (not built)

If renewal must be size-independent regardless of entity count, the **digest hybrid** stays available as a future optimization: sign `{ channelDigest, entitiesDigest, exp }` (fixed size) and let the client carry the raw entity list on the subscribe frame, the server validating `hash(entities) === entitiesDigest`. Renewal then re-signs only the tiny digest+exp. This is deliberately deferred (YAGNI) and recorded here so the option is not rediscovered from scratch.

---

## Testing

- **`grant.test`** — `entities` round-trips through sign → verify; a token with tampered/missing/non-array `ents` verifies to `null`; grace-window renewal preserves entities.
- **`ws/server.test`** — a `subscribe` frame subscribes the socket to exactly `channel + grant.entities`; an entity id _not_ in the grant is never subscribed (the frame has no channel-supplied entities to smuggle).
- **`live-client.test`** — `subscribe(grant)` derives nothing client-side; reconnect (`onOpen`) replays the stored grants; renewal replaces a grant in place preserving its entity set; a denied renewal drops the channel entry.
- **`useStateData.live.test` / `useStateData.server.test`** — lift `$grant` and subscribe with no client-computed topic list; SSR settle logs the grant; hydration embeds it and the client resubscribes on load.
- **Smoke (examples)** — an entity with a **serial integer id** cannot be watched by a socket whose grant does not enumerate it; the full serve → grant → subscribe → patch round-trip still delivers for enumerated entities.

---

## Migration impact

This is a second amendment to the still-unreleased protocol v2, touching the same files as the live-grants PR. It folds into the existing 3.0.0 `major` as a follow-up commit on `feat/grantless` **before** that branch merges — no separate release, no v3.

Net API deltas visible to integrators (all inside the same unreleased major):

- `subscribe` frame is `{ grant }` (no `entities`).
- `live.serve` signature unchanged; grants it mints now enumerate entities.
- The "ids must be unguessable" requirement is gone.
- `grantsHydration` drops its `secret`/`ttlMs` options; `live.hydration(registry)` unchanged.
- `collectEntityTopics` is exported from `rxfy` (core), not `rxfy-react`.
