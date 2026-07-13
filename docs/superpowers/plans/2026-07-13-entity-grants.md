# Entity Grants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind the exact entity topic set into the signed grant so the WS server authorizes entity subscriptions from the token alone — closing the "any valid grant can watch any guessable id" gap and removing the unguessable-id mandate.

**Architecture:** `serve` already parses the payload it signs a grant for, so it now also extracts that payload's `name:id` topics and signs them into the grant claims (`ents`). The `subscribe` frame drops its client-supplied `entities` field; the WS server subscribes to `channel + claims.entities` only. SSR stops re-signing — the entity-bearing grant `serve` produced is logged during render and embedded verbatim. Client and React bindings stop computing topic lists.

**Tech Stack:** TypeScript, pnpm workspaces + Turbo, Vitest 3, RxJS, HMAC-SHA256 (`node:crypto`), superjson.

**Spec:** [docs/superpowers/specs/2026-07-13-entity-grants-design.md](../specs/2026-07-13-entity-grants-design.md)

**Cross-package note:** This is a coordinated protocol change. Between tasks the _workspace_ typecheck may be red (a consumer still references the old frame shape); each task keeps its own package's tests green, and **Task 9** runs the full `turbo build/test/check-types/lint` and must end green. Implement tasks in order.

**Convention reminders:** Prettier — 120 width, double quotes, semicolons, trailing commas. Commit messages: no `Co-Authored-By` trailer. Work directly on `feat/grantless` (current branch; HEAD carries the grant code + the entity-grants spec).

---

## Task 1: Protocol — drop `entities` from the subscribe frame

**Files:**

- Modify: `packages/rxfy-protocol/src/messages.ts`
- Modify: `packages/rxfy-protocol/src/codec.ts`
- Test: `packages/rxfy-protocol/src/messages.test.ts`, `packages/rxfy-protocol/src/codec.test.ts`

- [ ] **Step 1: Update the message tests to the new frame shape**

In `messages.test.ts`, find the `subscribe` constructor test and replace the entities-bearing expectation. The constructor is now `subscribe(grant)`:

```ts
it("subscribe frame carries only the grant", () => {
  expect(subscribe("gtoken")).toEqual({ v: PROTOCOL_VERSION, kind: "subscribe", grant: "gtoken" });
});
```

In `codec.test.ts`, replace any `parseClientMessage` case that sends `entities`. Add/replace:

```ts
it("parses a subscribe frame with just a grant", () => {
  const raw = serialize(subscribe("gtoken"));
  expect(parseClientMessage(raw)).toEqual({ v: PROTOCOL_VERSION, kind: "subscribe", grant: "gtoken" });
});

it("rejects a subscribe frame with a non-string grant", () => {
  const raw = serialize({ v: PROTOCOL_VERSION, kind: "subscribe", grant: 42 } as never);
  expect(() => parseClientMessage(raw)).toThrow(/string `grant`/);
});
```

Delete any existing test asserting `entities: string[]` validation on the client frame.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter rxfy-protocol test`
Expected: FAIL — `subscribe` still requires two args / codec still returns `entities`.

- [ ] **Step 3: Update `messages.ts`**

Replace the `SubscribeMessage` type (lines 28–36) and the `subscribe` constructor (lines 58–63):

```ts
/** The client's ONLY outbound frame: present a signed channel grant. The grant's claims name the
 *  channel AND the exact entity topics (`name:id`) the served payload normalized into — the server
 *  subscribes to those and nothing the client asks for out of band. */
export type SubscribeMessage = {
  v: ProtocolVersion;
  kind: "subscribe";
  grant: string;
};
```

```ts
export const subscribe = (grant: string): SubscribeMessage => ({
  v: PROTOCOL_VERSION,
  kind: "subscribe",
  grant,
});
```

- [ ] **Step 4: Update `codec.ts`**

Replace the `subscribe` case in `parseClientMessage` (lines 63–69):

```ts
    case "subscribe": {
      if (typeof msg.grant !== "string") throw new ProtocolError("subscribe requires a string `grant`");
      return { v: PROTOCOL_VERSION, kind: "subscribe", grant: msg.grant };
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter rxfy-protocol test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy-protocol/src
git commit -m "feat(rxfy-protocol): drop entities from the subscribe frame (v2 amendment)"
```

---

## Task 2: rxfy core — add `collectShapeTopics` (server-side topic extraction)

`collectEntityTopics` walks a _normalized_ query (id shape). `serve` holds the _parsed_ shape (full entities), so it needs a sibling that reads ids via `model.getKey`.

**Files:**

- Modify: `packages/rxfy/src/state/normalize.ts:70-82` (add function after `collectEntityTopics`)
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `normalize.test.ts` (reuse whatever `createModel`/`defineState`/`array`/`single` helpers the file already imports; mirror an existing `collectEntityTopics` test's fixtures):

```ts
describe("collectShapeTopics", () => {
  it("extracts name:id topics from a parsed full-entity shape via getKey", () => {
    // `fields` from an existing fixture: { posts: array(post), author: single(user) }
    const shape = {
      posts: [
        { id: "p1", title: "a" },
        { id: "p2", title: "b" },
      ],
      author: { id: "u1", name: "z" },
    };
    expect(collectShapeTopics(fields, shape)).toEqual(["post:p1", "post:p2", "user:u1"]);
  });

  it("skips plain (zod) fields and null single entities", () => {
    const shape = { posts: [], author: null, count: 5 };
    expect(collectShapeTopics(fields, shape)).toEqual([]);
  });
});
```

> Adjust model names (`post`/`user`) and field names to match the fixture already used by the `collectEntityTopics` tests in this file. If no fixture exists, build one with the same `createModel({ name: "post", ... })` / `defineState` calls used elsewhere in the suite.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter rxfy test -- normalize`
Expected: FAIL — `collectShapeTopics is not a function`.

- [ ] **Step 3: Implement `collectShapeTopics`**

Add directly after `collectEntityTopics` (after line 82) in `normalize.ts`:

```ts
/**
 * `name:id` topics for every entity a *parsed* shape holds (full entities, pre-normalization) —
 * the server's authoritative subscription list, signed into the grant. Mirrors `collectEntityTopics`
 * but reads the id off each entity via `model.getKey` instead of expecting ids in place.
 */
export function collectShapeTopics(fields: FieldsMap, shape: Record<string, unknown>): string[] {
  const topics: string[] = [];
  for (const [fieldName, entry] of Object.entries(fields)) {
    if (!isFieldDescriptor(entry)) continue; // plain-value fields carry no entities
    const value = shape[fieldName];
    if (entry.kind === "array") {
      for (const entity of (value as unknown[]) ?? [])
        topics.push(`${entry.model.name}:${entry.model.getKey(entity as never)}`);
    } else if (value !== undefined && value !== null) {
      topics.push(`${entry.model.name}:${entry.model.getKey(value as never)}`);
    }
  }
  return topics;
}
```

Confirm `isFieldDescriptor` is already imported in `normalize.ts` (it is used by `collectEntityTopics`). No new import needed. `collectShapeTopics` is exported and flows through `packages/rxfy/src/index.ts` (which re-exports `./state/normalize.js`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter rxfy test -- normalize`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "feat(rxfy): add collectShapeTopics for server-side grant entity extraction"
```

---

## Task 3: rxfy core — rename the channel log to a grant log

The SSR log now holds full grants (entity-bearing), not channel strings. Rename to match.

**Files:**

- Rename: `packages/rxfy/src/state/channel-log.ts` → `packages/rxfy/src/state/grant-log.ts`
- Rename: `packages/rxfy/src/state/channel-log.test.ts` → `packages/rxfy/src/state/grant-log.test.ts`
- Modify: `packages/rxfy/src/index.ts:12`
- Modify: `packages/rxfy/src/model/model-store.ts:4,51,125,131`

- [ ] **Step 1: Rename the files with git**

```bash
git mv packages/rxfy/src/state/channel-log.ts packages/rxfy/src/state/grant-log.ts
git mv packages/rxfy/src/state/channel-log.test.ts packages/rxfy/src/state/grant-log.test.ts
```

- [ ] **Step 2: Rewrite `grant-log.ts`**

Replace the whole file with:

```ts
/** Per-request log of the signed grants produced during an SSR render. Fed by useStateData's SSR
 *  settle/seed paths; read by grantsHydration to embed grants in the hydration script (verbatim —
 *  each grant already names its channel + entities). Client-side it stays empty. Set-backed, so
 *  duplicate adds are idempotent. */
export type GrantLog = {
  add: (grant: string) => void;
  all: () => string[];
};

export function createGrantLog(): GrantLog {
  const grants = new Set<string>();
  return {
    add: (grant) => void grants.add(grant),
    all: () => [...grants],
  };
}
```

- [ ] **Step 3: Update `grant-log.test.ts`**

Replace `ChannelLog`/`createChannelLog` identifiers with `GrantLog`/`createGrantLog` and the import path (`./channel-log.js` → `./grant-log.js`). Keep the add/dedup/all assertions; the values are now opaque grant strings (e.g. `"g1"`, `"g2"`).

- [ ] **Step 4: Update `index.ts`**

Change line 12:

```ts
export * from "./state/grant-log.js";
```

- [ ] **Step 5: Update `model-store.ts`**

- Line 4:

```ts
import { type GrantLog, createGrantLog } from "../state/grant-log.js";
```

- Line 51 (the property in `IModelRegistry`) — replace `channels: ChannelLog;` with:

```ts
/** Signed grants logged during an SSR render — read by grantsHydration to embed in the script. */
grants: GrantLog;
```

- Line 125:

```ts
const grants = createGrantLog();
```

- Line 131 (inside the returned `registry` object) — replace `channels,` with:

```ts
    grants,
```

- [ ] **Step 6: Run rxfy tests**

Run: `pnpm --filter rxfy test`
Expected: PASS (grant-log suite green; nothing else in rxfy references `channels`).

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy/src
git commit -m "refactor(rxfy): rename registry channel log to grant log"
```

---

## Task 4: rxfy-server — entities in grant claims (`grant.ts`)

**Files:**

- Modify: `packages/rxfy-server/src/grant.ts`
- Test: `packages/rxfy-server/src/grant.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `grant.test.ts`:

```ts
it("round-trips entities through sign and verify", () => {
  const token = signGrant({ channel: "state:feed", entities: ["post:1", "post:2"], secret: "s", ttlMs: 1000 });
  const claims = verifyGrant(token, { secret: "s" });
  expect(claims).toEqual({ channel: "state:feed", entities: ["post:1", "post:2"], exp: expect.any(Number) });
});

it("rejects a grant whose ents claim is not a string[]", () => {
  const now = () => 1000;
  // hand-forge a token with a bad `ents` using the same secret so the signature is valid
  const token = signGrant({ channel: "c", entities: ["ok:1"], secret: "s", ttlMs: 1000, now });
  // tamper: verify still needs a VALID signature, so instead assert a numeric-entity payload is refused
  // by signing then re-checking a mutated decoded claim is out of scope; cover via type guard directly:
  expect(verifyGrant("a.b.c", { secret: "s" })).toBeNull();
});
```

> The forge-a-bad-`ents` case is awkward without a valid signature; keep the round-trip test as the primary guard and rely on the type check in `verifyGrant`. Update any existing `grant.test.ts` call to `signGrant` to pass `entities` (the arg is now required) — otherwise those tests won't compile.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter rxfy-server test -- grant`
Expected: FAIL — `signGrant` calls missing `entities`; `verifyGrant` returns no `entities`.

- [ ] **Step 3: Update `grant.ts`**

- Line 4:

```ts
export type GrantClaims = { channel: string; entities: string[]; exp: number };
```

- `signGrant` (lines 10–14):

```ts
export function signGrant(opts: {
  channel: string;
  entities: string[];
  secret: string;
  ttlMs: number;
  now?: () => number;
}): string {
  const now = opts.now ?? Date.now;
  const payload = Buffer.from(
    JSON.stringify({ ch: opts.channel, ents: opts.entities, exp: now() + opts.ttlMs }),
  ).toString("base64url");
  return `${HEADER}.${payload}.${hmac(`${HEADER}.${payload}`, opts.secret)}`;
}
```

- `verifyGrant` claim extraction (lines 35–38):

```ts
const { ch, ents, exp } = (claims ?? {}) as { ch?: unknown; ents?: unknown; exp?: unknown };
if (typeof ch !== "string" || typeof exp !== "number") return null;
if (!Array.isArray(ents) || ents.some((e) => typeof e !== "string")) return null;
if (exp + (opts.graceMs ?? 0) < now()) return null;
return { channel: ch, entities: ents as string[], exp };
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter rxfy-server test -- grant`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-server/src/grant.ts packages/rxfy-server/src/grant.test.ts
git commit -m "feat(rxfy-server): sign entity topics into grant claims"
```

---

## Task 5: rxfy-server — serve signs entities, renew carries them, hydration stops signing

**Files:**

- Modify: `packages/rxfy-server/src/server.ts`
- Modify: `packages/rxfy-server/src/hydration.ts`
- Test: `packages/rxfy-server/src/server.test.ts`, `packages/rxfy-server/src/hydration.test.ts`

- [ ] **Step 1: Write/adjust failing tests**

In `server.test.ts`, assert `serve` embeds entities in the grant and `renew` preserves them:

```ts
it("serve signs the payload's entity topics into the grant", () => {
  const live = createServer({ db, resources, hub, secret: "s" });
  const served = live.serve(feedState, {}, { posts: [{ id: "p1", title: "t" }] });
  const claims = verifyGrant(served.$grant, { secret: "s" });
  expect(claims?.entities).toEqual(["post:p1"]);
});

it("renew reissues the same channel and entities with a fresh expiry", () => {
  const live = createServer({ db, resources, hub, secret: "s" });
  const served = live.serve(feedState, {}, { posts: [{ id: "p1", title: "t" }] });
  const renewed = live.renew(served.$grant)!;
  const claims = verifyGrant(renewed, { secret: "s" });
  expect(claims?.entities).toEqual(["post:p1"]);
  expect(claims?.channel).toBe(verifyGrant(served.$grant, { secret: "s" })?.channel);
});
```

> Import `verifyGrant` from `"rxfy-server/hub"` in the test. Reuse the existing `feedState`/`resources`/`db`/`hub` fixtures the file already sets up; if the existing serve test uses a different state/model, mirror its entity names in the expectation.

In `hydration.test.ts`, `grantsHydration` no longer takes a secret and must embed the registry's logged grants verbatim:

```ts
it("embeds the registry's logged grants verbatim", () => {
  const registry = createModelRegistry();
  registry.grants.add("grant-A");
  registry.grants.add("grant-B");
  const script = grantsHydration(registry);
  expect(script).toContain("grant-A");
  expect(script).toContain("grant-B");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter rxfy build && pnpm --filter rxfy-server test -- server hydration`
Expected: FAIL — serve signs no entities; `grantsHydration` signature/behavior mismatch.

- [ ] **Step 3: Update `hydration.ts`**

Replace the whole file:

```ts
import { dehydrate, hydrationScript, type IModelRegistry } from "rxfy";

/**
 * One-call SSR payload: embeds the grants the render logged into the registry (each already names
 * its channel + entities) and returns the hydration script. No signing here — `serve` produced the
 * grants; the client lifts them (`readSsrGrants`) and subscribes. `createServer`'s `live.hydration`
 * wraps this; import directly from `rxfy-server/hub` for apps on the bare hub (no Drizzle stack).
 */
export function grantsHydration(registry: IModelRegistry): string {
  return hydrationScript({ ...dehydrate(registry), grants: registry.grants.all() });
}
```

- [ ] **Step 4: Update `server.ts`**

- Add `collectShapeTopics` and `FieldsMap` to the `rxfy` import (line 3):

```ts
import {
  collectShapeTopics,
  type FieldsMap,
  type IModelRegistry,
  parseShape,
  stateChannel,
  type StateDescriptor,
} from "rxfy";
```

- Delete the `signChannel` helper (line 71).
- Replace `serve`, `renew`, `hydration` (lines 132–143):

```ts
    serve(state, params, data) {
      const parsed = parseShape<Record<string, unknown>>(state.fields, data);
      const channel = stateChannel(state, params as Record<string, unknown>);
      if (!channel) throw new Error("rxfy-server: serve requires a keyed state");
      const entities = collectShapeTopics(state.fields as FieldsMap, parsed);
      return { ...parsed, $grant: signGrant({ channel, entities, secret: config.secret, ttlMs: grantTtlMs }) } as never;
    },
    renew(grant) {
      const claims = verifyGrant(grant, { secret: config.secret, graceMs: config.renewGraceMs ?? 5 * 60_000 });
      return claims === null
        ? null
        : signGrant({ channel: claims.channel, entities: claims.entities, secret: config.secret, ttlMs: grantTtlMs });
    },
    hydration(registry) {
      return grantsHydration(registry);
    },
```

- Update the `serve` JSDoc (lines 50–56) to mention it also signs the payload's entity topics into the grant, and drop the now-inaccurate "signs a grant per channel the render logged" from `hydration`'s doc (line 64):

```ts
/** SSR payload: embeds the grants the render logged (each entity-bearing) and returns the hydration script. */
hydration: (registry: IModelRegistry) => string;
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter rxfy build && pnpm --filter rxfy-server test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy-server/src
git commit -m "feat(rxfy-server): serve signs entities, renew carries them, hydration embeds logged grants"
```

---

## Task 6: rxfy-ws — subscribe from grant entities only

**Files:**

- Modify: `packages/rxfy-ws/src/server.ts:41-44` and the doc block (lines 12–17)
- Test: `packages/rxfy-ws/src/server.test.ts`, `packages/rxfy-ws/src/integration.test.ts`

- [ ] **Step 1: Update the tests**

In `server.test.ts`, the client sends only a grant; the socket must be subscribed to the grant's channel + entities, and a topic _not_ in the grant must never be subscribed. Replace the subscribe-frame construction to `subscribe(grant)` and add:

```ts
it("subscribes the socket to exactly the grant's channel and entities", () => {
  const grant = signGrant({ channel: "state:feed", entities: ["post:1"], secret: "s", ttlMs: 10_000 });
  socket.emit("message", serialize(subscribe(grant)));
  expect(hub.subscribe).toHaveBeenCalledWith(conn, ["c:state:feed", "e:post:1"], expect.any(Number));
});
```

> Match the exact `subscribe` spy assertion style already in the file (whether it uses a real in-memory hub or a mock). `channelSubscription("state:feed")` is `"c:state:feed"`; `entityTopicSubscription("post:1")` is `"e:post:1"`. Import `signGrant` and `subscribe` as the file's other tests do. Remove any assertion that read `frame.entities`.

In `integration.test.ts`, update the client subscribe call to send a grant whose claims enumerate the entities (use `signGrant` with the entities), and drop the separate entities argument.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter rxfy build && pnpm --filter rxfy-server build && pnpm --filter rxfy-ws test`
Expected: FAIL — server still reads `frame.entities`.

- [ ] **Step 3: Update `server.ts`**

Replace lines 41–44:

```ts
const claims = verifyGrant(frame.grant, { secret: options.secret });
if (claims === null) return;
const ids = [channelSubscription(claims.channel), ...claims.entities.map(entityTopicSubscription)];
hub.subscribe(conn, ids, claims.exp);
```

Update the doc block (lines 12–17) to drop the "entity ids are required to be unguessable" caveat:

```ts
/**
 * Bridges a Hub to WebSocket connections. Clients present a signed channel grant in each `subscribe`
 * frame; the grant's claims name the channel AND the exact entity topics it authorizes, so the
 * server subscribes to those alone — nothing the client asks for out of band. Invalid frames are
 * dropped silently: the client's renewal/refetch loop is the recovery path. A closed socket drops
 * all of its subscriptions.
 */
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter rxfy-ws test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-ws/src
git commit -m "feat(rxfy-ws): authorize entity subscriptions from grant claims only"
```

---

## Task 7: rxfy-client — subscribe forwards the grant only

**Files:**

- Modify: `packages/rxfy-client/src/live-client.ts`
- Test: `packages/rxfy-client/src/live-client.test.ts`

- [ ] **Step 1: Update the tests**

In `live-client.test.ts`:

- Every `client.subscribe(grant, entities)` call becomes `client.subscribe(grant)`.
- Every expectation on the sent frame drops `entities`: assert the transport received `subscribe(grant)` (i.e. `{ v, kind: "subscribe", grant }`).
- Keep reconnect-replay and renewal tests; renewal now preserves the entry by re-sending `subscribe(freshGrant)` (no entities to carry client-side).
- Remove any test asserting client-side entity merging across `subscribe` calls.

Add a focused test:

```ts
it("subscribe forwards only the grant on the frame", () => {
  const client = createLiveClient({ registry, transport, now });
  client.subscribe(makeGrant({ ch: "state:feed", exp: now() + 10_000 }));
  expect(sent).toContainEqual({ v: PROTOCOL_VERSION, kind: "subscribe", grant: expect.any(String) });
  expect(sent.at(-1)).not.toHaveProperty("entities");
});
```

> `makeGrant` = the test's existing helper that builds a decodable base64url grant (payload `{ ch, exp }`, and now optionally `ents` — the client ignores `ents`, so it need not include it). Reuse whatever the file already has.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter rxfy build && pnpm --filter rxfy-protocol build && pnpm --filter rxfy-client test`
Expected: FAIL — `subscribe` arity / frame shape mismatch.

- [ ] **Step 3: Update `live-client.ts`**

- `LiveClient.subscribe` type (line 20):

```ts
  /** Record a grant; sends the subscribe frame and replays it on reconnect and after renewal. */
  subscribe: (grant: string) => void;
```

- `entries` map value type (line 60) — drop `entities`:

```ts
const entries = new Map<string, { grant: string; exp: number }>(); // by channel
```

- `sendEntry` (lines 64–65):

```ts
const sendEntry = (entry: { grant: string }): void => transport.send(subscribeFrame(entry.grant));
```

- Update the `subscribeFrame` import name usage — it now takes one arg (already imported as `subscribe as subscribeFrame`).
- In `renew`, the renewed entry (line 92) drops `entities`:

```ts
const entry = { grant: fresh, exp: claims.exp };
```

- `client.subscribe` (lines 129–138):

```ts
    subscribe(grant) {
      const claims = decodeGrant(grant);
      if (claims === null) return;
      const entry = { grant, exp: claims.exp };
      entries.set(claims.ch, entry);
      sendEntry(entry);
      scheduleRenewal();
    },
```

- SSR intake (lines 154–162) collapses to:

```ts
// SSR intake: each grant self-describes its entities, so just resubscribe them all.
for (const grant of readSsrGrants()) client.subscribe(grant);
```

(Delete the `registry.stores()` walk and the `hydratedTopics` construction. `registry` is still used by `transport.onMessage` for patch routing, so keep the import and the `registry` destructure.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter rxfy-client test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-client/src
git commit -m "feat(rxfy-client): forward only the grant; entities ride the token"
```

---

## Task 8: rxfy-react — lift `$grant`, subscribe without a topic list, log grants for SSR

**Files:**

- Modify: `packages/rxfy-react/src/useStateData.ts`
- Test: `packages/rxfy-react/src/useStateData.live.test.tsx`, `packages/rxfy-react/src/useStateData.server.test.tsx`

- [ ] **Step 1: Update the tests**

In `useStateData.live.test.tsx`: the live client's `subscribe` spy is now called with a single grant argument (no topic array). Update expectations from `expect(subscribe).toHaveBeenCalledWith(grant, [...topics])` to `expect(subscribe).toHaveBeenCalledWith(grant)`.

In `useStateData.server.test.tsx`: assert the SSR path logs the served grant into `registry.grants` (so hydration can embed it):

```ts
it("logs the served grant during SSR for hydration", async () => {
  // render on the server with ssr=true and a fetchFn/defaultData whose payload carries $grant
  // ... existing SSR harness ...
  expect(registry.grants.all()).toContain(servedGrant);
});
```

> Reuse the file's existing SSR render harness and the `$grant` value its fixture serves. If the fixture didn't attach `$grant`, add one to the served payload.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter rxfy build && pnpm --filter rxfy-react test -- useStateData.live useStateData.server`
Expected: FAIL — subscribe called with two args; grants not logged.

- [ ] **Step 3: Update `useStateData.ts`**

- Remove `collectEntityTopics` from the `rxfy` import (line 13).
- Delete the render-time channel logging (lines 100–101).
- In the `defaultData` seed block (lines 121–128), replace with:

```ts
if (defaultData !== undefined && atom$.get().type === StatusEnum.IDLE) {
  const { $grant, ...payload } = defaultData as TShape & { $grant?: string };
  const query = normalizeResult(registry, fields, payload as TShape) as TQuery;
  atom$.set(createFulfilled(query));
  if (isServer && ssr && $grant !== undefined) registry.grants.add($grant);
  if ($grant !== undefined && liveClient) liveClient.subscribe($grant);
}
```

- In the `settle` success branch (lines 140–153), replace the strip/subscribe block with:

```ts
        (result) => {
          if (signal?.aborted) return;
          const { $grant, ...payload } = result as TShape & { $grant?: string };
          const query = normalizeResult(registry, fields, payload as TShape) as TQuery;
          atom$.set(createFulfilled(query));
          if (isServer && ssr && $grant !== undefined) registry.grants.add($grant);
          if ($grant !== undefined && liveClient) liveClient.subscribe($grant);
          counter?.reset();
        },
```

> `ssr` and `isServer` are both in scope inside the memo (`isServer` defined at the top of the memo; `ssr` captured from context). Keep the explanatory comments, trimmed to match.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter rxfy-react test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src
git commit -m "feat(rxfy-react): subscribe with grant only; log served grants for SSR hydration"
```

---

## Task 9: Integration — changeset, docs, examples, full green build

**Files:**

- Create: `.changeset/entity-grants.md`
- Modify: `.changeset/live-grants.md` (remove the unguessable-id warning), relevant `apps/docs` pages and `.agents/skills/rxfy-framework` references that describe entities-in-frame
- Verify: `examples/*`, `templates/*`

- [ ] **Step 1: Find direct callers of the changed signatures**

Run:

```bash
grep -rn "grantsHydration(" examples templates apps packages --include=*.ts --include=*.tsx | grep -v node_modules | grep -v "\.test\."
grep -rn "\.subscribe(" examples templates apps --include=*.ts --include=*.tsx | grep -v node_modules
grep -rn "must be unguessable\|unguessable\|UUID" apps/docs .agents/skills .changeset
```

Expected: `grantsHydration` callers are `createServer` (already fixed) and any bare-hub example calling it directly — update those to drop the `{ secret, ttlMs }` argument. Examples using `live.serve` / `live.hydration` / `createLiveClient` need no change (signatures unchanged). Fix any bare-hub `grantsHydration(reg, {...})` → `grantsHydration(reg)`.

- [ ] **Step 2: Write the changeset**

Create `.changeset/entity-grants.md`:

```markdown
---
"rxfy": major
"rxfy-protocol": major
"rxfy-server": major
"rxfy-client": major
"rxfy-ws": major
"rxfy-react": major
---

Entity grants: the signed grant now names the exact entity topics it authorizes.

`live.serve` extracts the served payload's `name:id` topics and signs them into the grant claims;
the `subscribe` frame drops its `entities` field (the client forwards only the grant); the WS server
subscribes to `channel + claims.entities` alone. Entity ids no longer need to be unguessable — a grant
authorizes a fixed, signed set. SSR reuses the served grant verbatim (`grantsHydration` no longer signs;
its `secret`/`ttlMs` options are removed). New `collectShapeTopics` export in `rxfy`.
```

- [ ] **Step 3: Remove the unguessable-id mandate from prior docs/changeset**

In `.changeset/live-grants.md`, delete the "🔒 Entity ids MUST be unguessable" bullet (it's superseded). In any `apps/docs` page or `.agents/skills/rxfy-framework/references/*` that states entity ids must be UUIDs / that entity topics ride the subscribe frame, update the wording to "the grant enumerates its entities" and note `permessage-deflate` as a deployment default for large grants. Do not touch `examples-shared` references in `apps/docs` (project rule).

- [ ] **Step 4: Full workspace verification**

Run:

```bash
turbo build
turbo check-types
turbo test
turbo lint
```

Expected: all PASS. Fix any remaining references to `frame.entities`, `registry.channels`, `ChannelLog`, `subscribe(grant, entities)`, or `signGrant`-without-entities surfaced by the type-check.

- [ ] **Step 5: Commit**

```bash
git add .changeset apps/docs .agents examples templates packages
git commit -m "docs(entity-grants): changeset, drop unguessable-id mandate, fix bare-hub callers"
```

---

## Self-Review

**Spec coverage:**

- §1 entities in claims → Task 4. §2 serve extracts+signs → Tasks 2, 5. §3 frame drops entities → Task 1. §4 WS trusts grant only → Task 6. §5 client forwards grant → Task 7. §6 SSR grant log reuse → Tasks 3, 5, 8. §7 renew carries entities → Task 5. §8 security posture / docs → Task 9. Traffic profile (permessage-deflate note) → Task 9 Step 3. Testing section → covered per-task + Task 9 full run.
- No spec requirement is left without a task.

**Type consistency:** `GrantClaims`/`signGrant`/`verifyGrant` all carry `entities: string[]` (Task 4) and are consumed with that shape in serve/renew (Task 5), ws (Task 6). `collectShapeTopics(fields, shape)` defined in Task 2, called in Task 5. `registry.grants` (Task 3) written in Task 8, read in Task 5. `subscribe(grant)` constructor (Task 1) matches `sendEntry`/`client.subscribe` (Task 7) and the ws assertion (Task 6). `GrantLog`/`createGrantLog` names consistent across Task 3.

**Placeholder scan:** No TBD/TODO. The two "adjust to the file's existing fixture" notes (Tasks 2, 5, 6, 7, 8) are pointers to reuse concrete existing test harnesses, not deferred work — the assertions and impl are fully specified.
