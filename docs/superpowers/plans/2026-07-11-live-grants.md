# Live Grants (protocol v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unshipped session-based live updates on `feat/grantless-2` with stateless JWT channel grants delivered in the served payload (spec: `docs/superpowers/specs/2026-07-11-live-grants-design.md`), shipping it as protocol v2 — the session design never becomes public API.

**Architecture:** `live.serve` signs a JWT (channel + exp) and attaches it to the parsed payload as `$grant`; `useStateData` lifts it and hands it with the payload's entity topics to the live client, which subscribes over WS and renews grants before expiry. The hub re-keys by socket connection with per-entry expiry; sessions, the session header, and the bind/release TTL are deleted.

**Tech Stack:** TypeScript, node:crypto (HS256 JWT — no new dependency), RxJS, Vitest 3, pnpm + Turbo.

**Context for a zero-context engineer:**

- The published packages (all 2.0.0) ship the OLD grant flow: `createTopicKeyer`, `RXFY_SECRET`, `grant`/`GrantSpec`, subscribe frames carrying hashed tokens, `addGrants`. This branch replaced that with sessions (protocol v2, unmerged, PR #23). This plan replaces sessions with JWT grants and keeps the protocol number **2** — changesets must describe the migration **from 2.0.0's old grants**, never from sessions.
- Entity topics use **model names** (`descriptor.name`). Patches already apply via `registry.namedStores().get(message.name)`, so `resource.name` must equal the model name for live updates — a pre-existing constraint, now also relied on by client-derived subscriptions.
- `defineState` requires `key` on this branch, so `stateChannel(state, params)` always returns a string on the serve path — `serve` can always sign.
- Run any package's tests from repo root: `pnpm --filter <pkg> test`. Full check: `turbo build test lint check-types`.

---

### Task 1: Spec renaming — grants become v2

**Files:**

- Rename: `docs/superpowers/specs/2026-07-11-live-grants-v3-design.md` → `docs/superpowers/specs/2026-07-11-live-grants-design.md`
- Modify: the renamed file; `docs/superpowers/specs/2026-07-08-auto-grants-design.md`

- [ ] **Step 1: Rename and retitle**

```bash
git mv docs/superpowers/specs/2026-07-11-live-grants-v3-design.md docs/superpowers/specs/2026-07-11-live-grants-design.md
```

In the renamed file: title → `# Live Grants: stateless JWT channel grants on the data plane (protocol v2)`; `**Status:** Approved`; replace the `Supersedes (if approved)` line with `**Replaces (pre-release):** the session design below never shipped; this design takes protocol v2.`; replace every `v3`/`protocol v3` referring to _this_ design with `v2` (the protocol section "PROTOCOL_VERSION bumps to 3" → "stays 2 — the session protocol never shipped"); in the Release section replace "Protocol v3" wording accordingly.

- [ ] **Step 2: Mark the session spec superseded**

At the top of `2026-07-08-auto-grants-design.md`, change `**Status:** Approved` to `**Status:** Superseded before release by [2026-07-11-live-grants-design.md](2026-07-11-live-grants-design.md) — sessions were never published; protocol v2 shipped as JWT channel grants.`

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs
git commit -m "docs(spec): live grants approved as protocol v2; session design superseded pre-release"
```

---

### Task 2: rxfy-protocol — `subscribe` replaces `hello`/`session`

**Files:**

- Modify: `packages/rxfy-protocol/src/messages.ts`, `packages/rxfy-protocol/src/codec.ts`
- Test: `packages/rxfy-protocol/src/messages.test.ts`, `packages/rxfy-protocol/src/codec.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the hello/session cases in `codec.test.ts` with:

```ts
it("round-trips a subscribe frame", () => {
  const msg = subscribe("jwt.token.here", ["post:1", "user:9"]);
  expect(parseClientMessage(serialize(msg))).toEqual({
    v: PROTOCOL_VERSION,
    kind: "subscribe",
    grant: "jwt.token.here",
    entities: ["post:1", "user:9"],
  });
});

it("rejects a subscribe frame without a string grant", () => {
  const raw = serialize({ v: PROTOCOL_VERSION, kind: "subscribe", grant: 42, entities: [] } as never);
  expect(() => parseClientMessage(raw)).toThrow(ProtocolError);
});

it("rejects a subscribe frame with non-string entities", () => {
  const raw = serialize({ v: PROTOCOL_VERSION, kind: "subscribe", grant: "g", entities: [1] } as never);
  expect(() => parseClientMessage(raw)).toThrow(ProtocolError);
});

it("no longer accepts hello or session frames", () => {
  expect(() => parseClientMessage(serialize({ v: PROTOCOL_VERSION, kind: "hello" } as never))).toThrow(ProtocolError);
  expect(() => parseServerMessage(serialize({ v: PROTOCOL_VERSION, kind: "session", session: "s" } as never))).toThrow(
    ProtocolError,
  );
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter rxfy-protocol test` — expect FAIL (`subscribe` not exported).

- [ ] **Step 3: Implement**

In `messages.ts`: delete `SessionMessage`, `HelloMessage`, `hello`, `session`, and `RXFY_SESSION_HEADER` (`PROTOCOL_VERSION` stays `2` — the session protocol never shipped, so v2 is ours to define). Add:

```ts
/** The client's ONLY outbound frame: present a signed channel grant and the raw entity topics
 *  (`name:id`) its payload normalized into. Channel access is authorized by the grant; entity
 *  topics are accepted alongside any currently-valid grant (ids are required to be unguessable). */
export type SubscribeMessage = {
  v: ProtocolVersion;
  kind: "subscribe";
  grant: string;
  entities: string[];
};

export type ClientMessage = SubscribeMessage;

export const subscribe = (grant: string, entities: string[]): SubscribeMessage => ({
  v: PROTOCOL_VERSION,
  kind: "subscribe",
  grant,
  entities,
});
```

`ServerMessage` becomes `PatchMessage | StaleMessage`. In `codec.ts`: delete the `session` case from `parseServerMessage`; replace `parseClientMessage`'s `hello` case with:

```ts
case "subscribe": {
  if (typeof msg.grant !== "string") throw new ProtocolError("subscribe requires a string `grant`");
  if (!Array.isArray(msg.entities) || msg.entities.some((e) => typeof e !== "string")) {
    throw new ProtocolError("subscribe requires `entities: string[]`");
  }
  return { v: PROTOCOL_VERSION, kind: "subscribe", grant: msg.grant, entities: msg.entities as string[] };
}
```

Update `messages.test.ts` constructor tests to match (delete hello/session cases, add one for `subscribe`).

- [ ] **Step 4: Run tests** — `pnpm --filter rxfy-protocol test` — expect PASS. (Downstream packages now fail to compile; they are fixed in their own tasks.)

- [ ] **Step 5: Commit** — `git add packages/rxfy-protocol && git commit -m "feat(rxfy-protocol): subscribe frame with grant + entities replaces hello/session"`

---

### Task 3: rxfy core — hydration payload carries `grants`

**Files:**

- Modify: `packages/rxfy/src/ssr/hydration.ts:4-9`
- Test: `packages/rxfy/src/ssr/hydration.test.ts`

- [ ] **Step 1: Write failing test** — in `hydration.test.ts`, replace the `session` round-trip test:

```ts
it("hydrationScript carries grants through to the payload", () => {
  const script = hydrationScript({ queries: {}, models: {}, grants: ["g1", "g2"] });
  expect(script).toContain('"grants"');
  expect(script).toContain("g1");
});
```

- [ ] **Step 2: Run** — `pnpm --filter rxfy test -- hydration` — expect FAIL (type error: `grants` not in `DehydratedState`).

- [ ] **Step 3: Implement** — in `DehydratedState`, replace `session?: string` (and its doc comment) with:

```ts
/** Signed channel grants for this render's states (rxfy-server's hydration()); the client
 *  live stack lifts these and subscribes. Absent for store-only SSR. */
grants?: string[];
```

- [ ] **Step 4: Run** — expect PASS. Also grep: `grep -rn "session" packages/rxfy/src` — expect no live-session references left (query-cache/session-unrelated hits are fine).

- [ ] **Step 5: Commit** — `git add packages/rxfy && git commit -m "feat(rxfy): hydration payload carries channel grants instead of a session id"`

---

### Task 4: rxfy core — `collectEntityTopics`

The client must derive `name:id` topics from a normalized payload. Server-side derivation walked a throwaway registry; the client registry is shared and accumulating, so derive from the **query shape** instead.

**Files:**

- Modify: `packages/rxfy/src/state/normalize.ts`, `packages/rxfy/src/index.ts` (export)
- Test: `packages/rxfy/src/state/normalize.test.ts` (or `state.test.ts` if normalize has no own test file — check first)

- [ ] **Step 1: Read `packages/rxfy/src/state/normalize.ts` and `packages/rxfy/src/model/model.ts`** to confirm the field descriptor shape (`array()`/`single()` results: how the field kind and model descriptor are stored). Mirror the traversal `normalizeResult`/`denormalizeValue` use.

- [ ] **Step 2: Write failing test** (adapt model/field construction to the file's existing test fixtures — reuse them):

```ts
it("collectEntityTopics lists name:id per entity slot of a normalized query", () => {
  // reuse the existing post/user fixtures in this test file
  const query = normalizeResult(createModelRegistry(), state.fields, {
    posts: [post1, post2],
    author: user9,
    total: 2,
  });
  expect(collectEntityTopics(state.fields, query as Record<string, unknown>).sort()).toEqual([
    "post:1",
    "post:2",
    "user:9",
  ]);
});
```

- [ ] **Step 3: Run** — expect FAIL (not exported).

- [ ] **Step 4: Implement** in `normalize.ts` (adjust property names to the real descriptor shape found in Step 1):

```ts
/** `name:id` topics for every entity id a normalized query shape holds — the client's entity
 *  subscription list for one payload. Names are model names (patches apply by model name). */
export function collectEntityTopics(fields: FieldsMap, query: Record<string, unknown>): string[] {
  const topics: string[] = [];
  for (const [key, field] of Object.entries(fields)) {
    if (field.kind === "array") {
      for (const id of (query[key] as string[]) ?? []) topics.push(`${field.model.name}:${id}`);
    } else if (field.kind === "single") {
      const id = query[key] as string | undefined;
      if (id !== undefined) topics.push(`${field.model.name}:${id}`);
    }
    // plain-value fields carry no entities
  }
  return topics;
}
```

Export from `packages/rxfy/src/index.ts` next to `normalizeResult`.

- [ ] **Step 5: Run** — `pnpm --filter rxfy test` — expect PASS.

- [ ] **Step 6: Commit** — `git add packages/rxfy && git commit -m "feat(rxfy): collectEntityTopics derives entity topics from a normalized query"`

---

### Task 5: rxfy-server — grant module (HS256 JWT)

**Files:**

- Create: `packages/rxfy-server/src/grant.ts`
- Test: `packages/rxfy-server/src/grant.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { signGrant, verifyGrant } from "./grant.js";

const secret = "test-secret";

describe("grant", () => {
  it("round-trips channel and expiry", () => {
    const token = signGrant({ channel: "todos|{}", secret, ttlMs: 60_000, now: () => 1_000_000 });
    expect(verifyGrant(token, { secret, now: () => 1_000_001 })).toEqual({
      channel: "todos|{}",
      exp: 1_060_000,
    });
  });

  it("rejects a tampered payload", () => {
    const token = signGrant({ channel: "a", secret, ttlMs: 60_000, now: () => 0 });
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ch: "b", exp: 9e12 })).toString("base64url");
    expect(verifyGrant(`${h}.${forged}.${s}`, { secret, now: () => 0 })).toBeNull();
  });

  it("rejects a wrong secret and garbage", () => {
    const token = signGrant({ channel: "a", secret, ttlMs: 60_000, now: () => 0 });
    expect(verifyGrant(token, { secret: "other", now: () => 0 })).toBeNull();
    expect(verifyGrant("not.a.jwt", { secret, now: () => 0 })).toBeNull();
  });

  it("rejects an expired grant, honoring the grace window", () => {
    const token = signGrant({ channel: "a", secret, ttlMs: 1_000, now: () => 0 });
    expect(verifyGrant(token, { secret, now: () => 1_001 })).toBeNull();
    expect(verifyGrant(token, { secret, now: () => 1_001, graceMs: 5_000 })).toEqual({ channel: "a", exp: 1_000 });
    expect(verifyGrant(token, { secret, now: () => 6_001, graceMs: 5_000 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `pnpm --filter rxfy-server test -- grant` — expect FAIL.

- [ ] **Step 3: Implement `grant.ts`**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

/** Decoded claims of a channel grant. `exp` is epoch milliseconds (not JWT seconds — internal format). */
export type GrantClaims = { channel: string; exp: number };

const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

const hmac = (input: string, secret: string): string => createHmac("sha256", secret).update(input).digest("base64url");

export function signGrant(opts: { channel: string; secret: string; ttlMs: number; now?: () => number }): string {
  const now = opts.now ?? Date.now;
  const payload = Buffer.from(JSON.stringify({ ch: opts.channel, exp: now() + opts.ttlMs })).toString("base64url");
  return `${HEADER}.${payload}.${hmac(`${HEADER}.${payload}`, opts.secret)}`;
}

/** Signature + expiry check. `graceMs` accepts recently-expired tokens (renewal only). Null on any failure. */
export function verifyGrant(
  token: string,
  opts: { secret: string; now?: () => number; graceMs?: number },
): GrantClaims | null {
  const now = opts.now ?? Date.now;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = hmac(`${header}.${payload}`, opts.secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  const { ch, exp } = (claims ?? {}) as { ch?: unknown; exp?: unknown };
  if (typeof ch !== "string" || typeof exp !== "number") return null;
  if (exp + (opts.graceMs ?? 0) < now()) return null;
  return { channel: ch, exp };
}
```

- [ ] **Step 4: Run** — expect PASS.

- [ ] **Step 5: Commit** — `git add packages/rxfy-server/src/grant*.ts && git commit -m "feat(rxfy-server): HS256 channel grants — signGrant/verifyGrant with expiry and grace"`

---

### Task 6: rxfy-server — socket-keyed, expiry-aware hub

**Files:**

- Modify: `packages/rxfy-server/src/hub.ts` (full rewrite of the hub body; keep `entitySubscription`/`channelSubscription`)
- Test: `packages/rxfy-server/src/hub.test.ts` (rewrite session/TTL cases)

- [ ] **Step 1: Write failing tests** (replace the session-keyed/bind/release/TTL tests):

```ts
it("delivers to subscribed connections until expiry", () => {
  const hub = createInMemoryHub({ now: () => clock });
  let clock = 0;
  const seen: Array<[number, unknown]> = [];
  hub.onPublish((conn, msg) => seen.push([conn, msg]));
  hub.subscribe(1, ["c:todos"], 1_000);
  hub.publish("c:todos", stale("todos"));
  clock = 1_001;
  hub.publish("c:todos", stale("todos"));
  expect(seen).toHaveLength(1);
});

it("re-subscribe extends expiry in place", () => {
  let clock = 0;
  const hub = createInMemoryHub({ now: () => clock });
  const seen: unknown[] = [];
  hub.onPublish((_conn, msg) => seen.push(msg));
  hub.subscribe(1, ["c:todos"], 1_000);
  clock = 900;
  hub.subscribe(1, ["c:todos"], 2_000);
  clock = 1_500;
  hub.publish("c:todos", stale("todos"));
  expect(seen).toHaveLength(1);
});

it("drop removes every subscription of a connection", () => {
  const hub = createInMemoryHub();
  const seen: unknown[] = [];
  hub.onPublish((_conn, msg) => seen.push(msg));
  hub.subscribe(1, ["c:todos", "e:todo:1"], Date.now() + 60_000);
  hub.drop(1);
  hub.publish("c:todos", stale("todos"));
  hub.publish("e:todo:1", stale("x"));
  expect(seen).toHaveLength(0);
});
```

- [ ] **Step 2: Run** — expect FAIL (signature mismatch).

- [ ] **Step 3: Implement** — replace the hub with:

```ts
import type { ServerMessage } from "rxfy-protocol";

/** A WebSocket connection id, assigned by the WS layer. Subscription state lives and dies with the socket. */
export type ConnId = number;

export type PublishSink = (conn: ConnId, message: ServerMessage) => void;

export const entitySubscription = (name: string, id: string): string => `e:${name}:${id}`;
export const channelSubscription = (channel: string): string => `c:${channel}`;

export type HubOptions = {
  /** Injectable clock (defaults to Date.now); used for deterministic tests. */
  now?: () => number;
};

/**
 * Pub/sub over subscription ids, keyed by connection. Subscriptions are written by the WS layer
 * from verified `subscribe` frames and expire with their grant; a closed socket drops everything —
 * the client owns durability by replaying its grants on reconnect.
 */
export type Hub = {
  publish: (id: string, message: ServerMessage) => void;
  /** Register ids for a connection, expiring at `exp` (epoch ms). Re-subscribing extends in place. */
  subscribe: (conn: ConnId, ids: string[], exp: number) => void;
  drop: (conn: ConnId) => void;
  onPublish: (sink: PublishSink) => void;
};

export function createInMemoryHub(options: HubOptions = {}): Hub {
  const { now = Date.now } = options;
  const subscribers = new Map<string, Set<ConnId>>(); // id -> conns
  const conns = new Map<ConnId, Map<string, number>>(); // conn -> id -> exp
  let sink: PublishSink | undefined;

  const forget = (conn: ConnId, id: string): void => {
    const holders = subscribers.get(id);
    if (!holders) return;
    holders.delete(conn);
    if (holders.size === 0) subscribers.delete(id);
  };

  return {
    publish(id, message) {
      const holders = subscribers.get(id);
      if (!holders || !sink) return;
      const t = now();
      for (const conn of [...holders]) {
        const exp = conns.get(conn)?.get(id);
        if (exp === undefined || exp <= t) {
          // lazily prune the expired entry; unpublished expired ids linger until the socket closes
          forget(conn, id);
          conns.get(conn)?.delete(id);
          continue;
        }
        sink(conn, message);
      }
    },
    subscribe(conn, ids, exp) {
      let entry = conns.get(conn);
      if (!entry) conns.set(conn, (entry = new Map()));
      for (const id of ids) {
        let holders = subscribers.get(id);
        if (!holders) subscribers.set(id, (holders = new Set()));
        holders.add(conn);
        entry.set(id, Math.max(entry.get(id) ?? 0, exp));
      }
    },
    drop(conn) {
      const entry = conns.get(conn);
      if (entry) for (const id of entry.keys()) forget(conn, id);
      conns.delete(conn);
    },
    onPublish(next) {
      sink = next;
    },
  };
}
```

- [ ] **Step 4: Run hub tests** — `pnpm --filter rxfy-server test -- hub` — expect PASS (server/hydration tests still broken — next task).

- [ ] **Step 5: Commit** — `git add packages/rxfy-server/src/hub* && git commit -m "feat(rxfy-server): socket-keyed expiry-aware hub; session lifecycle removed"`

---

### Task 7: rxfy-server — serving = signing; `renew`; grants hydration

**Files:**

- Modify: `packages/rxfy-server/src/server.ts`, `packages/rxfy-server/src/hydration.ts`, `packages/rxfy-server/src/hub-entry.ts`, `packages/rxfy-server/src/index.ts`
- Test: `packages/rxfy-server/src/server.test.ts`, `packages/rxfy-server/src/hydration.test.ts`

- [ ] **Step 1: Write failing tests** (replace the session-based serve/hydration cases):

```ts
it("serve parses and attaches a verifiable $grant for the state channel", () => {
  const live = createServer({ db, resources, hub, secret: "s", grantTtlMs: 60_000 });
  const result = live.serve(todosState, {}, { todos: [rawRow] });
  expect(result.todos[0].id).toBe(rawRow.id); // parsed shape intact
  const claims = verifyGrant((result as { $grant: string }).$grant, { secret: "s" });
  expect(claims?.channel).toBe(stateChannel(todosState, {}));
});

it("serve never touches the hub", () => {
  const calls: string[] = [];
  const spyHub = { ...hub, subscribe: () => calls.push("subscribe") } as Hub;
  const live = createServer({ db, resources, hub: spyHub, secret: "s" });
  live.serve(todosState, {}, { todos: [rawRow] });
  expect(calls).toHaveLength(0);
});

it("renew reissues a valid grant and rejects beyond grace", () => {
  const live = createServer({ db, resources, hub, secret: "s", grantTtlMs: 1_000 });
  const grant = (live.serve(todosState, {}, { todos: [] }) as { $grant: string }).$grant;
  const renewed = live.renew(grant);
  expect(renewed).not.toBeNull();
  expect(verifyGrant(renewed!, { secret: "s" })?.channel).toBe(stateChannel(todosState, {}));
  expect(live.renew("garbage")).toBeNull();
});

it("hydration signs one grant per logged channel", () => {
  const live = createServer({ db, resources, hub, secret: "s" });
  const registry = createModelRegistry();
  registry.channels.add("todos|{}");
  const script = live.hydration(registry);
  expect(script).toContain('"grants"');
});
```

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement `server.ts`**

`ServerConfig` gains `secret: string; grantTtlMs?: number; renewGraceMs?: number` (defaults 15 min / 5 min). Delete `SessionSource`, `sessionOf`, the `RXFY_SESSION_HEADER` import, `entityIds`, and `subscriptionIds` (the serve path no longer derives subscriptions — the client does). Delete the `normalizeResult`/`createModelRegistry` imports if now unused. The `Live` type changes:

```ts
serve: <TParams, TShape, TShapeInput>(
  state: StateDescriptor<TParams, TShape, any, any, any, TShapeInput>,
  params: TParams,
  data: TShapeInput,
) => TShape & { $grant: string };
/** Verify (with grace) and reissue one grant; null = signature invalid or beyond grace (denied). */
renew: (grant: string) => string | null;
/** SSR payload: signs a grant per channel the render logged, returns the hydration script. */
hydration: (registry: IModelRegistry) => string;
```

Implementations (inside `createServer`, after `applyTouch`):

```ts
const grantTtlMs = config.grantTtlMs ?? 15 * 60_000;
const signChannel = (channel: string): string => signGrant({ channel, secret: config.secret, ttlMs: grantTtlMs });
```

```ts
serve(state, params, data) {
  const parsed = parseShape<Record<string, unknown>>(state.fields, data);
  const channel = stateChannel(state, params as Record<string, unknown>);
  return { ...parsed, $grant: signChannel(channel!) } as never;
},
renew(grant) {
  const claims = verifyGrant(grant, { secret: config.secret, graceMs: config.renewGraceMs ?? 5 * 60_000 });
  return claims === null ? null : signChannel(claims.channel);
},
hydration(registry) {
  return grantsHydration(registry, { secret: config.secret, ttlMs: grantTtlMs });
},
```

`publishEntity`, `applyTouch`, and the writers are untouched. Note: `publishEntity` publishes under `resource.name`; client subscriptions use model names — add this line to `createResource`'s doc (or a dev-mode `console.warn` in `createServer` when `resource.name !== resource.model.name`, if `model.name` is reachable — check `resource.ts`).

- [ ] **Step 4: Implement `hydration.ts`** (replaces `hubHydration`):

```ts
import { dehydrate, hydrationScript, type IModelRegistry } from "rxfy";
import { signGrant } from "./grant.js";

/**
 * One-call SSR payload: signs a grant per channel the render logged into the registry and returns
 * the hydration script with the grants embedded. The client lifts them (`readSsrGrants`) and
 * subscribes — entity topics ride the client's first subscribe frame, derived from the hydrated
 * stores. `createServer`'s `live.hydration` wraps this; import directly from `rxfy-server/hub`
 * for apps on the bare hub (no Drizzle stack).
 */
export function grantsHydration(registry: IModelRegistry, opts: { secret: string; ttlMs?: number }): string {
  const grants = [...registry.channels.all()].map((channel) =>
    signGrant({ channel, secret: opts.secret, ttlMs: opts.ttlMs ?? 15 * 60_000 }),
  );
  return hydrationScript({ ...dehydrate(registry), grants });
}
```

Update `hub-entry.ts` (the `rxfy-server/hub` subpath): export `grantsHydration`, `signGrant`, `verifyGrant`, plus the existing hub/subscription/channel exports; delete the `hubHydration` export. Update `index.ts` re-exports to match.

- [ ] **Step 5: Run** — `pnpm --filter rxfy-server test` — expect PASS (fix any straggler session references the compiler finds).

- [ ] **Step 6: Commit** — `git add packages/rxfy-server && git commit -m "feat(rxfy-server): serve signs a channel grant; renew endpoint helper; grants hydration"`

---

### Task 8: rxfy-ws — server verifies subscribe frames

**Files:**

- Modify: `packages/rxfy-ws/src/server.ts`
- Test: `packages/rxfy-ws/src/server.test.ts`

- [ ] **Step 1: Write failing tests** (replace hello/session-minting cases; reuse the file's fake-socket helper):

```ts
it("a verified subscribe registers channel + entities and receives pushes", () => {
  const hub = createInMemoryHub();
  const ws = createWsServer(hub, { secret: "s" });
  const socket = fakeSocket();
  ws.handleConnection(socket);
  const grant = signGrant({ channel: "todos|{}", secret: "s", ttlMs: 60_000 });
  socket.emit("message", serialize(subscribe(grant, ["todo:1"])));
  hub.publish(channelSubscription("todos|{}"), stale("todos|{}"));
  hub.publish(entitySubscription("todo", "1"), patch("todo", "1", { done: true }));
  expect(socket.sent).toHaveLength(2);
});

it("an invalid or expired grant is dropped silently", () => {
  const hub = createInMemoryHub();
  const ws = createWsServer(hub, { secret: "s" });
  const socket = fakeSocket();
  ws.handleConnection(socket);
  socket.emit("message", serialize(subscribe("garbage", ["todo:1"])));
  hub.publish(entitySubscription("todo", "1"), patch("todo", "1", {}));
  expect(socket.sent).toHaveLength(0);
});

it("close drops the connection's subscriptions", () => {
  const hub = createInMemoryHub();
  const ws = createWsServer(hub, { secret: "s" });
  const socket = fakeSocket();
  ws.handleConnection(socket);
  const grant = signGrant({ channel: "c", secret: "s", ttlMs: 60_000 });
  socket.emit("message", serialize(subscribe(grant, [])));
  socket.emit("close");
  hub.publish(channelSubscription("c"), stale("c"));
  expect(socket.sent).toHaveLength(0);
});
```

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement** — replace `server.ts` body:

```ts
import { parseClientMessage, serialize } from "rxfy-protocol";
import { channelSubscription, type ConnId, type Hub, verifyGrant } from "rxfy-server/hub";

export type ServerSocket = {
  send: (data: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type WsServerOptions = { secret: string };

/**
 * Bridges a Hub to WebSocket connections. Clients present signed channel grants in `subscribe`
 * frames; entity topics are accepted alongside any currently-valid grant (entity ids are required
 * to be unguessable — see the live-grants spec). Invalid frames are dropped silently: the client's
 * renewal/refetch loop is the recovery path.
 */
export function createWsServer(
  hub: Hub,
  options: WsServerOptions,
): { handleConnection: (socket: ServerSocket) => void } {
  const sockets = new Map<ConnId, ServerSocket>();
  let nextConn: ConnId = 0;
  hub.onPublish((conn, message) => {
    sockets.get(conn)?.send(serialize(message));
  });

  return {
    handleConnection(socket) {
      const conn = nextConn++;
      sockets.set(conn, socket);

      socket.on("message", (data: unknown) => {
        const text = typeof data === "string" ? data : (data as { toString(): string }).toString();
        let frame;
        try {
          frame = parseClientMessage(text);
        } catch {
          return;
        }
        const claims = verifyGrant(frame.grant, { secret: options.secret });
        if (claims === null) return;
        const ids = [channelSubscription(claims.channel), ...frame.entities.map((e) => `e:${e}`)];
        hub.subscribe(conn, ids, claims.exp);
      });

      socket.on("close", () => {
        sockets.delete(conn);
        hub.drop(conn);
      });
    },
  };
}
```

(If `rxfy-server/hub` does not export a bare `e:` helper for pre-joined `name:id` topics, add `export const entityTopicSubscription = (topic: string): string => \`e:${topic}\`;`to`hub.ts` and use it instead of the inline template.)

- [ ] **Step 4: Run** — `pnpm --filter rxfy-ws test -- server` — expect PASS.

- [ ] **Step 5: Commit** — `git add packages/rxfy-ws packages/rxfy-server && git commit -m "feat(rxfy-ws): server verifies subscribe grants; conn-scoped subscriptions"`

---

### Task 9: rxfy-ws — client transport: send/onOpen

**Files:**

- Modify: `packages/rxfy-ws/src/client.ts`
- Test: `packages/rxfy-ws/src/client.test.ts`, `packages/rxfy-ws/src/integration.test.ts`

- [ ] **Step 1: Write failing tests** (replace hello-replay cases):

```ts
it("send delivers when open and drops when not (no buffering — onOpen replay owns recovery)", () => {
  /* fake socket, assert */
});
it("onOpen fires on first open and every reconnect", () => {
  /* open, drop, reconnect via fake factory; count callback firings */
});
```

Write these against the file's existing fake `WebSocketImpl` pattern (see the current hello tests for the harness — reuse it verbatim, swapping hello assertions for `send`/`onOpen`).

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement** — `ClientTransport` becomes:

```ts
export type ClientTransport = {
  /** Send a client frame; silently dropped when the socket isn't open — the live client replays
   *  its full grant set on every `onOpen`, which is the durability mechanism. */
  send: (message: ClientMessage) => void;
  onMessage: (handler: (message: ServerMessage) => void) => void;
  /** Fires on every (re)connect once the socket is open. Single slot. */
  onOpen: (handler: () => void) => void;
  close: () => void;
};
```

In `createWsClient`: delete `session`/`announced` and the hello replay; keep the reconnect loop; in the `open` listener call the registered `onOpen` handler; `send(message)` serializes and sends when `readyState === OPEN`. Update `integration.test.ts` to drive subscribe frames end to end (client `send(subscribe(grant, [...]))` → server verifies → hub publish → client `onMessage` receives patch).

- [ ] **Step 4: Run** — `pnpm --filter rxfy-ws test` — expect PASS.

- [ ] **Step 5: Commit** — `git add packages/rxfy-ws && git commit -m "feat(rxfy-ws): client transport send/onOpen; hello replay removed"`

---

### Task 10: rxfy-client — grant custody, renewal loop, SSR intake

**Files:**

- Delete: `packages/rxfy-client/src/session.ts`, `packages/rxfy-client/src/session.test.ts`
- Rename: `packages/rxfy-client/src/read-session.ts` → `read-grants.ts` (+ test file)
- Modify: `packages/rxfy-client/src/live-client.ts`, `packages/rxfy-client/src/index.ts`
- Test: `packages/rxfy-client/src/live-client.test.ts`, `packages/rxfy-client/src/read-grants.test.ts`

- [ ] **Step 1: Implement `read-grants.ts`** (with test mirroring the old read-session test):

```ts
/** All `grants` arrays across the SSR hydration chunks, flattened. */
export function readSsrGrants(): string[] {
  const chunks = (globalThis as { __RXFY_SSR__?: Array<{ grants?: string[] }> }).__RXFY_SSR__ ?? [];
  return chunks.flatMap((chunk) => chunk.grants ?? []);
}
```

- [ ] **Step 2: Write failing live-client tests** (replace session/hello cases; keep the patch/stale/counter cases as-is):

```ts
it("subscribe() sends the frame, records the entry, and replays on onOpen", () => {
  /* fake transport capturing send + onOpen cb; call client.subscribe(grant, ["todo:1"]); fire onOpen; expect two identical frames */
});
it("adopts SSR grants on startup, attaching current registry entities to the first frame", () => {
  /* seed __RXFY_SSR__ with grants + a registry with a hydrated store; expect subscribe frames: first carries the store's name:id topics, rest carry [] */
});
it("renews grants before expiry via renewUrl and re-subscribes", async () => {
  /* stub globalThis.fetch to return fresh grants; grant with short exp; injectable now/timer — expect fetch called with the expiring grants and a re-sent subscribe */
});
it("a failed renewal drops the entry silently", async () => {
  /* fetch returns { grants: [null] }; expect no re-subscribe, no throw */
});
```

Write complete test bodies against a fake transport `{ sent: ClientMessage[], send, onMessage, onOpen }`. Grants in tests are real `signGrant` outputs? No — rxfy-client must not depend on rxfy-server. Build test tokens inline: ``const token = (exp: number, ch = "c") => `h.${Buffer.from(JSON.stringify({ ch, exp })).toString("base64url")}.s`;`` (the client only decodes, never verifies).

- [ ] **Step 3: Run** — expect FAIL.

- [ ] **Step 4: Implement `live-client.ts`**

```ts
import { collectEntityTopics, type IModelRegistry } from "rxfy";
import { type ClientMessage, type ServerMessage, subscribe as subscribeFrame } from "rxfy-protocol";
import { BehaviorSubject, type Observable } from "rxjs";
import { readSsrGrants } from "./read-grants.js";

export type LiveTransport = {
  send: (message: ClientMessage) => void;
  onMessage: (handler: (message: ServerMessage) => void) => void;
  onOpen: (handler: () => void) => void;
};

export type ChannelCounter = { available$: Observable<number>; reset: () => void };

export type LiveClient = {
  /** Record a grant + its payload's entity topics; sends the subscribe frame and replays it on reconnect. */
  subscribe: (grant: string, entities: string[]) => void;
  channel: (channel: string) => ChannelCounter;
  stop: () => void;
};

export type LiveClientConfig = {
  registry: IModelRegistry;
  transport: LiveTransport;
  /** Renewal endpoint (POST { grants: string[] } -> { grants: (string | null)[] }). Omit to let grants expire. */
  renewUrl?: string;
  /** Renew this long before the soonest expiry. */
  renewLeadMs?: number;
  now?: () => number;
};

/** Decode a grant's payload without verifying — the client only needs ch/exp for bookkeeping. */
const decodeGrant = (token: string): { ch: string; exp: number } | null => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return typeof payload.ch === "string" && typeof payload.exp === "number" ? payload : null;
  } catch {
    return null;
  }
};

export function createLiveClient(config: LiveClientConfig): LiveClient {
  const { registry, transport, renewLeadMs = 60_000, now = Date.now } = config;
  const counters = new Map<string, BehaviorSubject<number>>();
  const entries = new Map<string, { grant: string; exp: number; entities: string[] }>(); // by channel
  let renewTimer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const sendEntry = (entry: { grant: string; entities: string[] }): void =>
    transport.send(subscribeFrame(entry.grant, entry.entities));

  const scheduleRenewal = (): void => {
    if (renewTimer) clearTimeout(renewTimer);
    if (!config.renewUrl || entries.size === 0 || stopped) return;
    const soonest = Math.min(...[...entries.values()].map((e) => e.exp));
    renewTimer = setTimeout(renew, Math.max(0, soonest - renewLeadMs - now()));
  };

  const renew = async (): Promise<void> => {
    const stale = [...entries.values()].filter((e) => e.exp - renewLeadMs <= now());
    if (stale.length === 0) return scheduleRenewal();
    try {
      const res = await fetch(config.renewUrl!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grants: stale.map((e) => e.grant) }),
      });
      const { grants } = (await res.json()) as { grants: (string | null)[] };
      grants.forEach((fresh, i) => {
        const old = stale[i];
        const claims = fresh === null ? null : decodeGrant(fresh);
        if (fresh === null || claims === null) {
          entries.delete(decodeGrant(old.grant)?.ch ?? old.grant); // denied — updates for this state end
          return;
        }
        const entry = { grant: fresh, exp: claims.exp, entities: old.entities };
        entries.set(claims.ch, entry);
        sendEntry(entry);
      });
    } catch {
      // network failure: leave entries; the next schedule retries after the lead window
    }
    scheduleRenewal();
  };

  transport.onMessage((message) => {
    switch (message.kind) {
      case "patch":
        registry
          .namedStores()
          .get(message.name)
          ?.set(message.id, message.data as unknown);
        break;
      case "stale": {
        const counter = counters.get(message.channel);
        if (counter) counter.next(counter.value + 1);
        break;
      }
    }
  });

  transport.onOpen(() => {
    for (const entry of entries.values()) sendEntry(entry);
  });

  const client: LiveClient = {
    subscribe(grant, entities) {
      const claims = decodeGrant(grant);
      if (claims === null) return;
      const existing = entries.get(claims.ch);
      const merged = existing ? [...new Set([...existing.entities, ...entities])] : entities;
      const entry = { grant, exp: claims.exp, entities: merged };
      entries.set(claims.ch, entry);
      sendEntry(entry);
      scheduleRenewal();
    },
    channel(channel) {
      let counter = counters.get(channel);
      if (!counter) counters.set(channel, (counter = new BehaviorSubject(0)));
      const subject = counter;
      return { available$: subject.asObservable(), reset: () => subject.next(0) };
    },
    stop() {
      stopped = true;
      if (renewTimer) clearTimeout(renewTimer);
      for (const counter of counters.values()) counter.complete();
      counters.clear();
      entries.clear();
    },
  };

  // SSR intake: hydrated entities ride the first grant's frame (any valid grant authorizes entity topics).
  const ssrGrants = readSsrGrants();
  if (ssrGrants.length > 0) {
    const hydratedTopics: string[] = [];
    for (const { descriptor, store } of registry.stores()) {
      for (const [key] of store.valueEntries()) hydratedTopics.push(`${descriptor.name}:${key}`);
    }
    ssrGrants.forEach((grant, i) => client.subscribe(grant, i === 0 ? hydratedTopics : []));
  }

  return client;
}
```

Update `index.ts`: export `readSsrGrants`; delete `getSessionId`/`sessionHeaders`/`withSession`/`readSsrSession` exports. (`collectEntityTopics` is imported here only if the SSR intake uses it — the store-walk above does not; remove the import if unused.)

- [ ] **Step 5: Run** — `pnpm --filter rxfy-client test` — expect PASS.

- [ ] **Step 6: Commit** — `git add packages/rxfy-client && git commit -m "feat(rxfy-client): grant custody with renewal loop; session helpers removed"`

---

### Task 11: rxfy-react — `$grant` lift in useStateData

**Files:**

- Modify: `packages/rxfy-react/src/useStateData.ts:130-141` (the `settle` function), `packages/rxfy-react/src/live-context.ts` (LiveClient type import only, if needed)
- Test: `packages/rxfy-react/src/useStateData.live.test.tsx`

- [ ] **Step 1: Write failing test** (in the live test file, using its existing fake live client — extend the fake with a `subscribe` spy):

```tsx
it("lifts $grant from the fetch result and subscribes with the payload's entity topics", async () => {
  const fetchFn = async () => ({ todos: [todo1], $grant: "h.payload.s" }) as never;
  // render useStateData with the fake live client; await settle
  expect(fakeLive.subscribed).toEqual([{ grant: "h.payload.s", entities: ["todo:1"] }]);
  // and the $grant key must NOT reach the normalized data
});

it("a payload without $grant subscribes nothing and normalizes as before", async () => {
  /* plain fetch, expect no subscribe call, data intact */
});
```

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement** — in `settle`'s fulfilled branch (`useStateData.ts:132-136`), lift before normalizing:

```ts
(result) => {
  if (signal?.aborted) return;
  const { $grant, ...payload } = result as TShape & { $grant?: string };
  const query = normalizeResult(registry, fields, payload as TShape) as TQuery;
  atom$.set(createFulfilled(query));
  if ($grant !== undefined && liveClient) {
    liveClient.subscribe($grant, collectEntityTopics(fields, query as Record<string, unknown>));
  }
  counter?.reset();
},
```

Import `collectEntityTopics` from `rxfy`. Both conditions are load-bearing: no `$grant` (endpoint doesn't `live.serve`) → not live; no live client in context (store-only app) → grant dropped after stripping. Do the same strip in the `defaultData` seeding branch (`useStateData.ts:118-120`) — a router-loader payload may also carry `$grant`.

The live-client interface used here is structural (`useLiveClient()`); confirm `live-context.ts` types it as the rxfy-client `LiveClient` (it gained `subscribe`).

- [ ] **Step 4: Run** — `pnpm --filter rxfy-react test` — expect PASS; fix any test fixtures that asserted hello/session behavior (delete `readSsrSession` mentions — the react package re-exports the rxfy-client surface, so update `index.tsx` re-exports: `readSsrGrants` in, session helpers out).

- [ ] **Step 5: Commit** — `git add packages/rxfy-react && git commit -m "feat(rxfy-react): useStateData lifts \$grant and subscribes payload entity topics"`

---

### Task 12: templates — rewire vite (and check next)

**Files:**

- Modify: `templates/vite/server/live.ts`, `templates/vite/server/api.ts`, `templates/vite/server/ws.ts`, `templates/vite/src/api-client.tsx`, `templates/vite/src/entry-client.tsx`, `templates/vite/server/live.smoke.test.ts`, `templates/vite/src/ssr.smoke.test.ts`
- Check: `templates/next` (uses `hubHydration`? grep first)

- [ ] **Step 1: Rewire**

- `server/live.ts`: `createServer({ db, resources, hub, secret: process.env.RXFY_SECRET ?? "dev-secret-change-me" })`.
- `server/api.ts`: `live.serve(todosState, {}, { todos: rows })` (drop `c.req.raw`); add the renew route:

```ts
api.post("/live/renew", async (c) => {
  const { grants } = await c.req.json<{ grants: string[] }>();
  return c.json({ grants: grants.map((g) => live.renew(g)) });
});
```

- `server/ws.ts`: `createWsServer(hub, { secret: ... })` (share the secret constant via `server/live.ts` export).
- `src/api-client.tsx`: plain `hc<AppType>("/api")` — delete the `sessionHeaders` wiring.
- `src/entry-client.tsx`: `createLiveClient({ registry, transport, renewUrl: "/api/live/renew" })`.

- [ ] **Step 2: Update smoke tests** — `ssr.smoke.test.ts`: hydration payload contains `grants` (not `session`). `live.smoke.test.ts`: end to end — SSR render → client subscribes with lifted grants → `live.update` → patch received; client-only fetch → `$grant` lift → `touch` → stale received.

- [ ] **Step 3: Check templates/next** — `grep -rn "hubHydration\|readSsrSession\|withSession\|sessionHeaders" templates/next examples` — rewire any hits (`hubHydration(hub, registry, extra)` → `grantsHydration(registry, { secret })`).

- [ ] **Step 4: Run** — `pnpm --filter template-vite test` (check the actual package name in `templates/vite/package.json` first) — expect PASS.

- [ ] **Step 5: Commit** — `git add templates && git commit -m "feat(templates): vite template on channel grants; session wiring removed"`

---

### Task 13: examples sweep

**Files:** all hits of `grep -rln "withSession\|sessionHeaders\|getSessionId\|readSsrSession\|RXFY_SESSION_HEADER\|live\.serve(.*req\|hubHydration" examples/`

- [ ] **Step 1: Sweep** — apply the same rewiring as Task 12 to each live example (`vite-blog-framework`, `waku-blog`, `vite-ssr-pagination`, and any other hit): `serve` loses `req`, api-clients lose session headers, entry-clients gain `renewUrl`, servers gain `secret`, one renew route per app server.

- [ ] **Step 2: Run** — `turbo test --filter='./examples/*'` — expect PASS (smoke tests updated the same way as Task 12).

- [ ] **Step 3: Commit** — `git add examples && git commit -m "refactor(examples): migrate to channel grants"`

---

### Task 14: changesets — describe grants against published 2.0.0

**Files:**

- Delete: `.changeset/live-sessions.md`
- Create: `.changeset/live-grants.md`
- Modify: `.changeset/rxfy-client.md`, `.changeset/hub-subpath.md`, `.changeset/hub-hydration.md`, `.changeset/serve-parses-input-shape.md`

- [ ] **Step 1: Rewrite.** Audience: users of the **published 2.0.0 old grant flow** (`createTopicKeyer`, `RXFY_SECRET` env, `grant`/`GrantSpec`, hashed-token subscriptions, `addGrants`/`readSsrGrants` v1). Sessions never shipped — no changeset may mention them.

`.changeset/live-grants.md` (major: rxfy, rxfy-protocol, rxfy-ws, rxfy-server, rxfy-react):

```md
Automatic live subscriptions via signed channel grants — the declared-grant flow is removed.

`live.serve(state, params, data)` signs a per-state JWT grant (channel + expiry) and attaches it
to the parsed payload as `$grant`; `useStateData` lifts it automatically and subscribes with the
payload's entity topics. Nothing to declare, no keyer, no fetch-client wiring.

- `rxfy`: hydration payload carries `grants: string[]`; new `collectEntityTopics`.
- `rxfy-protocol`: v2 — `subscribe { grant, entities }` is the only client frame; hashed-token
  subscribe/unsubscribe frames are gone.
- `rxfy-server`: `createServer` requires `secret`; `serve` returns the parsed shape + `$grant`;
  new `renew`; hub is socket-keyed with grant expiry; `createTopicKeyer`, `grant`, `GrantSpec`,
  `Grants` are removed.
- `rxfy-ws`: the server verifies grants on `subscribe`; the client transport is `send`/`onOpen`.
- `rxfy-react`: `useStateData` lifts `$grant`; `addGrants` and grant props are removed.

SECURITY: entity patches fan out on raw `name:id` topics gated by a valid grant — entity ids MUST
be unguessable (UUIDs, not serial integers) in live-enabled apps.
```

Rewrite `rxfy-client.md` (new package: grant custody, renewal loop, `readSsrGrants`, `createLiveClient` moved from rxfy-react — no session helpers). Rewrite `hub-subpath.md`/`hub-hydration.md` for `grantsHydration` + `signGrant`/`verifyGrant` on the `rxfy-server/hub` subpath and the socket-keyed hub. In `serve-parses-input-shape.md`, update `serve`'s signature mention (no `req`). Verify none of the remaining changesets mention sessions: `grep -rli session .changeset/`.

- [ ] **Step 2: Commit** — `git add .changeset && git commit -m "chore(changesets): describe channel grants against published 2.0.0"`

---

### Task 15: docs site + skills sweep

**Files:** `apps/docs/src/pages/framework/server/sessions.mdx` (→ `grants.mdx`), `hub.mdx`, `create-server.mdx`, `writes.mdx`, `messages.mdx`, `framework/ws/*.mdx`, `react/live-client.mdx`, `getting-started/framework.mdx`, `guides/live-blog.mdx`, `guides/todo-app.mdx`, `apps/docs/vocs.config.ts` (sidebar), package READMEs, `.agents/skills/rxfy-framework/**` (`live-sessions.md` reference → `live-grants.md`)

- [ ] **Step 1: Sweep** — rename the sessions page to grants, rewrite content per the spec (serve signs; client lifts; renewal; opaque-id requirement gets its own prominent callout), update every code sample to the new signatures (`serve` without `req`, `createServer` with `secret`, `createLiveClient` with `renewUrl`, no `withSession`).
- [ ] **Step 2: Verify** — `grep -rin "session" apps/docs/src/pages .agents/skills packages/*/README.md | grep -vi "session cookie"` — every remaining hit must be justified; `pnpm --filter docs build` (check the docs package name) must pass.
- [ ] **Step 3: Commit** — `git add apps/docs .agents packages/*/README.md && git commit -m "docs: channel grants replace sessions across site, skills, and READMEs"`

---

### Task 16: full verification

- [ ] **Step 1:** `turbo build test lint check-types` from repo root — expect all green. Fix stragglers (the compiler will catch any remaining `hello`/`session`/`RXFY_SESSION_HEADER` references).
- [ ] **Step 2:** `grep -rn "RXFY_SESSION_HEADER\|readSsrSession\|withSession\|sessionHeaders\|getSessionId\|hubHydration\|SessionMessage\|HelloMessage" packages templates examples` — expect zero hits.
- [ ] **Step 3:** Commit any fixes.

---

### Task 17: history restructure + PR update

The branch history must not contain the session implementation. Recipe (proven twice on this branch):

- [ ] **Step 1: Backup** — `git branch backup/grantless-2-sessions && git push origin feat/grantless-2:backup/feat-grantless-sessions`
- [ ] **Step 2: Rebuild** — `git fetch origin && git reset origin/develop`, then re-commit in dependency order (adapt the grouping we used before; changesets ride with their package):

1. `feat(rxfy): typed model registry, required model/state identity, sync store cells, grants hydration` — `packages/rxfy` + its changesets
2. `feat(rxfy-protocol,rxfy-ws): protocol v2 — grant-bearing subscribe frame and verifying transports` — both packages
3. `feat(rxfy-server): signed channel grants, renew, socket-keyed hub, writer typing` — package + changesets
4. `feat(rxfy-client): browser live runtime with grant custody and renewal` — package + changeset
5. `feat(rxfy-react): $grant lift in useStateData` — package + live-grants changeset
6. `refactor(templates): channel grants and endpoint-driven data` — `templates`
7. `refactor(examples): channel grants, endpoint-driven data; drop vite-todo` — `examples` + `pnpm-lock.yaml`
8. `docs: channel grants, create-rxfy-app, skills and specs` — `apps/docs .agents docs README.md`

- [ ] **Step 3: Verify parity** — `git status --short` empty; `git diff backup/grantless-2-sessions HEAD --stat` empty; `git merge-base --is-ancestor origin/develop HEAD` succeeds.
- [ ] **Step 4: Push** — `git push origin feat/grantless-2:feat/grantless --force-with-lease=refs/heads/feat/grantless:<current-remote-sha>` (read the sha with `git ls-remote origin refs/heads/feat/grantless` first).
- [ ] **Step 5: PR** — retitle #23 (`gh pr edit 23 --title "feat: automatic live subscriptions via signed channel grants"`) and rewrite the body from the new spec: summary, how it works (serve signs → client lifts → subscribe → renew), changes by package, removed list (old grant flow APIs), breaking changes & migration (including the opaque-id requirement, prominently), template/example architecture, changesets/3.0.0 note.

---

## Self-review notes

- Spec coverage: every spec section maps to a task (protocol §1 → T2; grants §2 → T5; serve §3 → T7; hub §4 → T6; ws §5 → T8/T9; client §6 → T10; react §7 → T11; template §8 → T12; security/edge cases → tests in T5–T11 + docs callout in T15; release → T14).
- Deliberate deviations from the spec, to fold back into it during Task 1: `ClientTransport` gains `onOpen` (the spec said "replays the current grant set" without naming the hook); `renew` takes/returns arrays at the endpoint but a single token in `live.renew` (nullable); grant `exp` is epoch **milliseconds**, not JWT seconds (internal format, documented in `grant.ts`).
- Types used across tasks were cross-checked: `subscribe(grant, entities)` (T2) ↔ ws server parse (T8) ↔ live client `sendEntry` (T10); `verifyGrant` claims `{channel, exp}` (T5) ↔ hub `exp` (T6) ↔ ws server (T8); `$grant` attach (T7) ↔ lift (T11); `grants` payload field (T3) ↔ `grantsHydration` (T7) ↔ `readSsrGrants` (T10).
