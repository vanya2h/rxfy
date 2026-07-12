# Live Sessions (grants removal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the capability-grant live-update flow with server-held session subscriptions: the server records what each session was served and pushes updates to it; the client's entire outbound protocol is one `hello` frame.

**Architecture:** The hub's subscription table (already `session → ids`) gets written by the *serve path* (`live.serve` pass-through per read endpoint, `live.hydration` for SSR) instead of by client subscribe frames carrying granted tokens. The keyer/grant machinery is deleted across all packages. Channel derivation (`stateChannel`) is consolidated into `rxfy` core, and the registry gains a `ChannelLog` that `useStateData` feeds during SSR. Spec: `docs/superpowers/specs/2026-07-08-auto-grants-design.md`.

**Tech Stack:** TypeScript, pnpm + Turbo monorepo, tsup, Vitest 3, RxJS, zod, drizzle + PGlite (tests), Hono (template/example servers).

**Conventions for this plan:**
- Run package tests with `pnpm turbo test --filter=<pkg>` (turbo builds dependencies first).
- Commit messages are plain conventional commits — NO `Co-Authored-By` or AI-attribution trailers.
- `Read` any file before editing it. Line numbers cited below are pre-change positions; verify before editing.

---

### Task 0: Branch

**Files:** none

- [ ] **Step 0.1:** Create the working branch off the current branch (the vite template only exists on `feat/create-rxfy-app`, so branch from it):

```bash
git checkout -b feat/live-sessions
```

---

### Task 1: `rxfy` core — canonical `stateChannel`

The single channel-derivation implementation, replacing the duplicated copies in `rxfy-react/src/live/channel.ts` and `rxfy-server/src/state-channel.ts` (those are migrated in Tasks 6 and 9).

**Files:**
- Create: `packages/rxfy/src/state/channel.ts`
- Create: `packages/rxfy/src/state/channel.test.ts`
- Modify: `packages/rxfy/src/index.ts`

- [ ] **Step 1.1: Write the failing test**

Create `packages/rxfy/src/state/channel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stateChannel } from "./channel.js";

describe("stateChannel", () => {
  it("returns the bare key when there are no params", () => {
    expect(stateChannel({ key: "todos" }, {})).toBe("todos");
  });

  it("returns undefined for keyless states", () => {
    expect(stateChannel({}, { a: 1 })).toBeUndefined();
  });

  it("appends sorted key=value params", () => {
    expect(stateChannel({ key: "posts" }, { orgId: "A", author: 7 })).toBe("posts:author=7&orgId=A");
  });

  it("drops window params so every page shares one channel", () => {
    const state = { key: "posts", window: ["page", "sort"] as const };
    expect(stateChannel(state, { author: 7, page: 3, sort: "asc" })).toBe("posts:author=7");
    expect(stateChannel(state, { author: 7, page: 4, sort: "desc" })).toBe("posts:author=7");
  });

  it("drops undefined params", () => {
    expect(stateChannel({ key: "posts" }, { author: undefined, tag: "x" })).toBe("posts:tag=x");
  });

  it("encodes scalars raw and objects as sorted-key JSON", () => {
    expect(stateChannel({ key: "s" }, { flag: true, n: 2 })).toBe("s:flag=true&n=2");
    expect(stateChannel({ key: "s" }, { f: { b: 2, a: 1 } })).toBe('s:f={"a":1,"b":2}');
    expect(stateChannel({ key: "s" }, { f: [1, "x"] })).toBe('s:f=[1,"x"]');
  });
});
```

- [ ] **Step 1.2: Run to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/state/channel.test.ts`
Expected: FAIL — cannot resolve `./channel.js`.

- [ ] **Step 1.3: Implement**

Create `packages/rxfy/src/state/channel.ts` (algorithm identical to the two existing copies — see `packages/rxfy-react/src/live/channel.ts`):

```ts
/** The minimal shape channel derivation needs from a state descriptor. */
export type ChannelStateDescriptor = { key?: string; window?: readonly string[] };

/** Deterministic JSON: object keys sorted recursively so logically-equal values stringify equally. */
const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
  return `{${entries.join(",")}}`;
};

const encode = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : stableJson(value);

/**
 * Window-independent invalidation channel for a state instance; `undefined` for keyless states.
 * Window dims (page, sort, cursor…) are dropped so every window of one partition shares a channel.
 * The single canonical implementation — client subscriptions and server publishes both use it.
 */
export function stateChannel(state: ChannelStateDescriptor, params: Record<string, unknown>): string | undefined {
  if (!state.key) return undefined;
  const windowKeys = new Set<string>(state.window ?? []);
  const suffix = Object.keys(params)
    .filter((k) => !windowKeys.has(k) && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${encode(params[k])}`)
    .join("&");
  return suffix ? `${state.key}:${suffix}` : state.key;
}
```

Add to `packages/rxfy/src/index.ts` (keep the list alphabetical by path — insert before `./state/normalize.js`):

```ts
export * from "./state/channel.js";
```

- [ ] **Step 1.4: Run to verify it passes**

Run: `pnpm turbo test --filter=rxfy`
Expected: PASS (all existing rxfy tests plus the new file).

- [ ] **Step 1.5: Commit**

```bash
git add packages/rxfy/src/state/channel.ts packages/rxfy/src/state/channel.test.ts packages/rxfy/src/index.ts
git commit -m "feat(rxfy): canonical stateChannel derivation in core"
```

---

### Task 2: `rxfy` core — `ChannelLog` on the registry

**Files:**
- Create: `packages/rxfy/src/state/channel-log.ts`
- Create: `packages/rxfy/src/state/channel-log.test.ts`
- Modify: `packages/rxfy/src/model/model-store.ts` (IModelRegistry type ~line 29, createModelRegistry ~line 106, added$ doc comment ~lines 37–43)
- Modify: `packages/rxfy/src/index.ts`

- [ ] **Step 2.1: Write the failing test**

Create `packages/rxfy/src/state/channel-log.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createModelRegistry } from "../model/model-store.js";
import { createChannelLog } from "./channel-log.js";

describe("createChannelLog", () => {
  it("records channels and lists them", () => {
    const log = createChannelLog();
    log.add("todos");
    log.add("posts:author=7");
    expect(log.all().sort()).toEqual(["posts:author=7", "todos"]);
  });

  it("is idempotent — duplicate adds record once", () => {
    const log = createChannelLog();
    log.add("todos");
    log.add("todos");
    expect(log.all()).toEqual(["todos"]);
  });

  it("is exposed on the model registry", () => {
    const registry = createModelRegistry();
    registry.channels.add("todos");
    expect(registry.channels.all()).toEqual(["todos"]);
  });
});
```

- [ ] **Step 2.2: Run to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/state/channel-log.test.ts`
Expected: FAIL — cannot resolve `./channel-log.js`.

- [ ] **Step 2.3: Implement**

Create `packages/rxfy/src/state/channel-log.ts`:

```ts
/** Per-request log of the state channels materialized during a render or serve call. Fed by
 *  useStateData (SSR) and rxfy-server's serve(); read when registering a session's live
 *  subscriptions. Client-side it stays empty. Set-backed, so duplicate adds are idempotent. */
export type ChannelLog = {
  add: (channel: string) => void;
  all: () => string[];
};

export function createChannelLog(): ChannelLog {
  const channels = new Set<string>();
  return {
    add: (channel) => void channels.add(channel),
    all: () => [...channels],
  };
}
```

In `packages/rxfy/src/model/model-store.ts`:

1. Add the import at the top: `import { type ChannelLog, createChannelLog } from "../state/channel-log.js";`
2. In the `IModelRegistry` type, after the `queries: QueryCache;` line, add:

```ts
  /** State channels materialized this request — read by live-session registration during SSR. */
  channels: ChannelLog;
```

3. In `createModelRegistry()`, next to `const queries = createQueryCache();` add `const channels = createChannelLog();`, and add `channels,` to the returned object (next to `queries,`).
4. Update the `added$` doc comment (currently ends with "A live-update client can drive its subscriptions straight off this instead of per-query wiring."): replace that final sentence with "Useful for driving side effects off entity arrivals; live updates no longer subscribe per-entity (the server tracks served sessions)."

Add to `packages/rxfy/src/index.ts` next to the Task 1 line:

```ts
export * from "./state/channel-log.js";
```

- [ ] **Step 2.4: Run to verify it passes**

Run: `pnpm turbo test --filter=rxfy`
Expected: PASS.

- [ ] **Step 2.5: Commit**

```bash
git add packages/rxfy/src/state/channel-log.ts packages/rxfy/src/state/channel-log.test.ts packages/rxfy/src/model/model-store.ts packages/rxfy/src/index.ts
git commit -m "feat(rxfy): ChannelLog on the model registry"
```

---

### Task 3: `rxfy` core — hydration carries `session`, not `grants`

**Files:**
- Modify: `packages/rxfy/src/ssr/hydration.ts` (line 7)
- Modify: `packages/rxfy/src/ssr/hydration.test.ts` (grants round-trip describe, ~lines 79–88)

- [ ] **Step 3.1: Update the test**

In `packages/rxfy/src/ssr/hydration.test.ts`, replace the `describe("DehydratedState grants round-trip", ...)` block with:

```ts
describe("DehydratedState session round-trip", () => {
  it("preserves the session id through serializeForHtml → JSON.parse", () => {
    const state: DehydratedState = {
      queries: {},
      models: {},
      session: "sess-123",
    };
    const script = hydrationScript(state);
    const json = script.slice(script.indexOf("push(") + 5, script.lastIndexOf(")"));
    const parsed = JSON.parse(json) as DehydratedState;
    expect(parsed.session).toBe("sess-123");
  });
});
```

(Adapt the extraction of the JSON payload to match how the existing grants test parsed the script — reuse its exact mechanism, only changing the field.)

- [ ] **Step 3.2: Run to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/ssr/hydration.test.ts`
Expected: FAIL — `session` is not a known property of `DehydratedState`.

- [ ] **Step 3.3: Implement**

In `packages/rxfy/src/ssr/hydration.ts`, replace the `grants?:` field of `DehydratedState`:

```ts
export type DehydratedState = {
  queries: Record<string, SerializedWrapped>;
  models: Record<string, Record<string, unknown>>;
  /** The live session the server registered this render's subscriptions under (rxfy-server's hydration()). */
  session?: string;
};
```

`dehydrate`/`hydrate`/`hydrationScript` bodies are unchanged (`session` rides through the object spread at the call site; `hydrate` ignores it — the client reads it via `readSsrSession`).

- [ ] **Step 3.4: Run to verify it passes**

Run: `pnpm turbo test --filter=rxfy`
Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add packages/rxfy/src/ssr/hydration.ts packages/rxfy/src/ssr/hydration.test.ts
git commit -m "feat(rxfy): hydration payload carries a live session id instead of grants"
```

---

### Task 4: `rxfy-protocol` v2 — `hello` only

**Files:**
- Modify: `packages/rxfy-protocol/src/messages.ts`
- Modify: `packages/rxfy-protocol/src/codec.ts` (parseClientMessage, ~lines 63–79)
- Modify: `packages/rxfy-protocol/src/messages.test.ts`, `packages/rxfy-protocol/src/codec.test.ts`

- [ ] **Step 4.1: Write the failing tests**

In `packages/rxfy-protocol/src/messages.test.ts`, delete tests for `subscribe`/`unsubscribe` constructors and add:

```ts
it("hello carries the session id", () => {
  expect(hello("sess-1")).toEqual({ v: 2, kind: "hello", session: "sess-1" });
});
```

In `packages/rxfy-protocol/src/codec.test.ts`, delete parse tests for subscribe/unsubscribe frames and add:

```ts
it("round-trips a hello frame", () => {
  expect(parseClientMessage(serialize(hello("sess-1")))).toEqual({ v: 2, kind: "hello", session: "sess-1" });
});

it("rejects a hello without a string session", () => {
  expect(() => parseClientMessage(serialize({ v: 2, kind: "hello", session: 5 } as never))).toThrow(ProtocolError);
});
```

Update every remaining `v: 1` expectation in both test files to `v: 2` (the version bump).

- [ ] **Step 4.2: Run to verify it fails**

Run: `pnpm --filter rxfy-protocol exec vitest run`
Expected: FAIL — `hello` not exported; version mismatches.

- [ ] **Step 4.3: Implement**

In `packages/rxfy-protocol/src/messages.ts`:

1. `export const PROTOCOL_VERSION = 2 as const;`
2. Delete `SubscribeMessage`, `UnsubscribeMessage` and their constructors (`subscribe`, `unsubscribe`).
3. Replace the client-message section with:

```ts
// --- Client -> server messages ---

/** Announce the session after every (re)connect. The client's ONLY outbound frame: subscriptions
 *  are written server-side by the serve path, so there is nothing else for a client to say. */
export type HelloMessage = {
  v: ProtocolVersion;
  kind: "hello";
  session: string;
};

export type ClientMessage = HelloMessage;
```

4. Add the constructor and the header constant:

```ts
export const hello = (session: string): HelloMessage => ({ v: PROTOCOL_VERSION, kind: "hello", session });

/** HTTP header carrying the live session id, matched to the WebSocket `hello`. */
export const RXFY_SESSION_HEADER = "x-rxfy-session";
```

In `packages/rxfy-protocol/src/codec.ts`, replace `parseClientMessage` with:

```ts
export function parseClientMessage(raw: string): ClientMessage {
  const msg = decode(raw);
  switch (msg.kind) {
    case "hello":
      if (typeof msg.session !== "string") {
        throw new ProtocolError("hello requires a string `session`");
      }
      return { v: PROTOCOL_VERSION, kind: "hello", session: msg.session };
    default:
      throw new ProtocolError(`unknown client message kind: ${clip(msg.kind)}`);
  }
}
```

Delete the now-unused `isStringArray` helper.

- [ ] **Step 4.4: Run to verify it passes**

Run: `pnpm turbo test --filter=rxfy-protocol`
Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add packages/rxfy-protocol/src
git commit -m "feat(rxfy-protocol): v2 — hello frame replaces subscribe/unsubscribe"
```

---

### Task 5: `rxfy-server` — session-keyed hub with TTL

**Files:**
- Rewrite: `packages/rxfy-server/src/hub.ts`
- Rewrite: `packages/rxfy-server/src/hub.test.ts`

- [ ] **Step 5.1: Write the failing tests**

Replace `packages/rxfy-server/src/hub.test.ts` entirely:

```ts
import { stale } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { createInMemoryHub } from "./hub.js";

const msg = stale("todos");

describe("createInMemoryHub", () => {
  it("delivers a publish to every subscribed session", () => {
    const hub = createInMemoryHub();
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["c:todos"]);
    hub.subscribe("s2", ["c:todos"]);
    hub.publish("c:todos", msg);
    expect(seen.sort()).toEqual(["s1", "s2"]);
  });

  it("unsubscribe stops delivery for that id only", () => {
    const hub = createInMemoryHub();
    const seen: string[] = [];
    hub.onPublish((_s, m) => seen.push(m.kind));
    hub.subscribe("s1", ["a", "b"]);
    hub.unsubscribe("s1", ["a"]);
    hub.publish("a", msg);
    hub.publish("b", msg);
    expect(seen).toEqual(["stale"]);
  });

  it("drop removes all of a session's subscriptions", () => {
    const hub = createInMemoryHub();
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a", "b"]);
    hub.drop("s1");
    hub.publish("a", msg);
    hub.publish("b", msg);
    expect(seen).toEqual([]);
  });

  it("expires an unbound session after ttlMs", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a"]); // never binds (e.g. SSR session whose client never arrived)
    t = 99;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]);
    t = 100;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]); // expired — no second delivery
  });

  it("a bound session never expires; release restarts the clock", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a"]);
    hub.bind("s1");
    t = 1_000_000;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]); // bound: still alive
    hub.release("s1");
    t += 99;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1", "s1"]); // within ttl after release
    t += 1;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1", "s1"]); // ttl elapsed — dropped
  });

  it("re-bind after release cancels expiry (reconnect)", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a"]);
    hub.bind("s1");
    hub.release("s1");
    t = 50;
    hub.bind("s1"); // reconnected in time
    t = 1_000_000;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]);
  });

  it("subscribing again refreshes an unbound session's ttl", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a"]);
    t = 90;
    hub.subscribe("s1", ["b"]); // activity restarts the clock
    t = 150;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]);
  });
});
```

- [ ] **Step 5.2: Run to verify it fails**

Run: `pnpm --filter rxfy-server exec vitest run src/hub.test.ts`
Expected: FAIL — `bind`/`release`/options don't exist.

- [ ] **Step 5.3: Implement**

Replace `packages/rxfy-server/src/hub.ts` entirely:

```ts
import type { ServerMessage } from "rxfy-protocol";

/** A browser session id — minted by the server for SSR loads, or by the client for CSR-only loads. */
export type SessionId = string;

/** Delivers a message to one session's socket (registered by the transport). */
export type PublishSink = (session: SessionId, message: ServerMessage) => void;

export type HubOptions = {
  /** How long an unbound session's subscriptions survive (never-connected SSR sessions, closed tabs). */
  ttlMs?: number;
  /** Injectable clock (defaults to Date.now); used for deterministic tests. */
  now?: () => number;
};

/**
 * Pub/sub over subscription ids, keyed by session. Subscriptions are written by the SERVE path
 * (rxfy-server's serve/hydration), never by client frames; the WS layer only binds/releases
 * sockets. Holds NO counters — the "updates available" tally is purely client-side.
 */
export type Hub = {
  publish: (id: string, message: ServerMessage) => void;
  subscribe: (session: SessionId, ids: string[]) => void;
  unsubscribe: (session: SessionId, ids: string[]) => void;
  /** Socket liveness from the transport. Bound sessions never expire; release starts the TTL clock. */
  bind: (session: SessionId) => void;
  release: (session: SessionId) => void;
  drop: (session: SessionId) => void;
  onPublish: (sink: PublishSink) => void;
};

const DEFAULT_TTL_MS = 5 * 60_000;

export function createInMemoryHub(options: HubOptions = {}): Hub {
  const { ttlMs = DEFAULT_TTL_MS, now = Date.now } = options;
  type Session = { ids: Set<string>; bound: boolean; expiresAt: number };
  const subscribers = new Map<string, Set<SessionId>>(); // id -> sessions
  const sessions = new Map<SessionId, Session>();
  let sink: PublishSink | undefined;

  const forget = (session: SessionId, id: string): void => {
    const holders = subscribers.get(id);
    if (!holders) return;
    holders.delete(session);
    if (holders.size === 0) subscribers.delete(id);
  };

  const drop = (session: SessionId): void => {
    const entry = sessions.get(session);
    if (entry) for (const id of entry.ids) forget(session, id);
    sessions.delete(session);
  };

  /** Evict unbound sessions whose TTL elapsed — called lazily from publish/subscribe/bind. */
  const sweep = (): void => {
    const t = now();
    for (const [session, entry] of sessions) {
      if (!entry.bound && entry.expiresAt <= t) drop(session);
    }
  };

  const ensure = (session: SessionId): Session => {
    let entry = sessions.get(session);
    if (!entry) sessions.set(session, (entry = { ids: new Set(), bound: false, expiresAt: now() + ttlMs }));
    return entry;
  };

  return {
    publish(id, message) {
      sweep();
      const holders = subscribers.get(id);
      if (!holders || !sink) return;
      for (const session of holders) sink(session, message);
    },
    subscribe(session, ids) {
      sweep();
      const entry = ensure(session);
      if (!entry.bound) entry.expiresAt = now() + ttlMs; // fresh activity restarts the clock
      for (const id of ids) {
        let holders = subscribers.get(id);
        if (!holders) subscribers.set(id, (holders = new Set()));
        holders.add(session);
        entry.ids.add(id);
      }
    },
    unsubscribe(session, ids) {
      const entry = sessions.get(session);
      if (!entry) return;
      for (const id of ids) {
        forget(session, id);
        entry.ids.delete(id);
      }
    },
    bind(session) {
      sweep();
      const entry = ensure(session);
      entry.bound = true;
    },
    release(session) {
      const entry = sessions.get(session);
      if (!entry) return;
      entry.bound = false;
      entry.expiresAt = now() + ttlMs;
    },
    drop,
    onPublish(next) {
      sink = next;
    },
  };
}
```

Note: the `ConnId` type is deleted; `SessionId` replaces it. Task 6/7 fix the importers.

- [ ] **Step 5.4: Run the hub tests**

Run: `pnpm --filter rxfy-server exec vitest run src/hub.test.ts`
Expected: PASS. (Other rxfy-server tests may now fail to compile — fixed in Task 6; do not run the full suite yet.)

- [ ] **Step 5.5: Commit**

```bash
git add packages/rxfy-server/src/hub.ts packages/rxfy-server/src/hub.test.ts
git commit -m "feat(rxfy-server): session-keyed hub with bind/release TTL lifecycle"
```

---

### Task 6: `rxfy-server` — `serve`/`hydration`, keyer and grants deleted

**Files:**
- Rewrite: `packages/rxfy-server/src/server.ts`
- Rewrite: `packages/rxfy-server/src/state-channel.ts` (thin wrapper over core)
- Delete: `packages/rxfy-server/src/topic-key.ts`, `packages/rxfy-server/src/topic-key.test.ts`
- Modify: `packages/rxfy-server/src/index.ts`
- Modify: `packages/rxfy-server/src/server.test.ts`
- Check: `packages/rxfy-server/src/browser.ts` (must not reference topic-key; adjust if it does)

- [ ] **Step 6.1: Write the failing tests**

In `packages/rxfy-server/src/server.test.ts`: the file has existing fixtures (resources, db helper, hub setup) used by the `describe("createServer.grant", ...)` block (~line 122). Delete that describe block and add the two below, **reusing the same fixture names the deleted block used** (a post resource whose model is named `post`, plus the file's existing `db`/`resources`/hub construction). Also update every `createServer({ db, resources, hub, keyer })` call in the file to `createServer({ db, resources, hub })`, delete `createTopicKeyer` imports/usage, and change hub subscriptions in existing publish assertions from hashed ids to raw prefixed ids (`hub.subscribe("client", ["e:post:1"])` for entity topics, `["c:<channel>"]` for channels). Update any `v: 1` message expectations to `v: 2`.

```ts
describe("createServer.serve", () => {
  it("returns data unchanged and registers the session's entity + channel subscriptions", async () => {
    // build db/resources/hub/live exactly as the other describes in this file do
    const seen: string[] = [];
    hub.onPublish((session, message) => seen.push(`${session}:${message.kind}`));

    const state = defineState({ key: "posts", params: z.object({}), model: { posts: array(postModel) } });
    const data = { posts: [{ id: "1", title: "a" }] };
    const result = live.serve("sess-1", state, {}, data);
    expect(result).toBe(data); // pass-through, same reference

    hub.publish("e:post:1", patch("post", "1", { id: "1", title: "b" }));
    hub.publish("c:posts", stale("posts"));
    expect(seen).toEqual(["sess-1:patch", "sess-1:stale"]);
  });

  it("accepts a fetch Request and reads the session header", () => {
    const req = new Request("http://x/", { headers: { "x-rxfy-session": "sess-2" } });
    const state = defineState({ key: "posts", params: z.object({}), model: { posts: array(postModel) } });
    live.serve(req, state, {}, { posts: [{ id: "1", title: "a" }] });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.publish("c:posts", stale("posts"));
    expect(seen).toEqual(["sess-2"]);
  });

  it("is a no-op without a session", () => {
    const req = new Request("http://x/");
    const state = defineState({ key: "posts", params: z.object({}), model: { posts: array(postModel) } });
    const data = { posts: [] as Array<{ id: string; title: string }> };
    expect(live.serve(req, state, {}, data)).toBe(data);
  });
});

describe("createServer.hydration", () => {
  it("mints a session, registers the render registry, and embeds the session in the script", () => {
    const registry = createModelRegistry();
    normalizeResult(registry, { posts: array(postModel) }, { posts: [{ id: "1", title: "a" }] });
    registry.channels.add("posts");

    const script = live.hydration(registry);
    expect(script).toContain("__RXFY_SSR__");
    expect(script).toContain("session");

    const session = /"session":"([^"]+)"/.exec(script)?.[1];
    expect(session).toBeTruthy();

    const seen: string[] = [];
    hub.onPublish((s) => seen.push(s));
    hub.publish("e:post:1", patch("post", "1", { id: "1", title: "b" }));
    hub.publish("c:posts", stale("posts"));
    expect(seen).toEqual([session, session]);
  });

  it("skips models with no backing resource", () => {
    const registry = createModelRegistry();
    const localModel = createModel({
      schema: z.object({ id: z.string() }),
      getKey: (x) => x.id,
      name: "local-only",
    });
    registry.model(localModel).setMany([{ id: "9" }]);
    live.hydration(registry);
    const seen: string[] = [];
    hub.onPublish((s) => seen.push(s));
    hub.publish("e:local-only:9", stale("x"));
    expect(seen).toEqual([]);
  });
});
```

(Imports needed at the top of the test file: `array`, `createModel`, `createModelRegistry`, `defineState`, `normalizeResult` from `rxfy`; `patch`, `stale` from `rxfy-protocol`; `z` from `zod`. Each test constructs a fresh hub/live, matching the file's existing per-test setup style.)

- [ ] **Step 6.2: Run to verify it fails**

Run: `pnpm --filter rxfy-server exec vitest run src/server.test.ts`
Expected: FAIL — `serve`/`hydration` don't exist; `keyer` still required.

- [ ] **Step 6.3: Implement server.ts**

Replace `packages/rxfy-server/src/server.ts` entirely (write/update/delete bodies are unchanged from the current file except for the publish helpers — copy them from the existing file):

```ts
import { randomUUID } from "node:crypto";
import { eq, getTableColumns, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { type PgColumn, type PgDatabase, type PgTable } from "drizzle-orm/pg-core";
import {
  createModelRegistry,
  dehydrate,
  hydrationScript,
  type IModelRegistry,
  normalizeResult,
  type StateDescriptor,
  stateChannel,
} from "rxfy";
import { patch, RXFY_SESSION_HEADER, stale } from "rxfy-protocol";
import type { Hub, SessionId } from "./hub.js";
import type { Resource } from "./resource.js";
import type { AnyResource, ResourceRegistry } from "./resource-registry.js";
import { invalidationChannel, type StateChannelDescriptor } from "./state-channel.js";

/** Any drizzle pg database (pglite in tests, node-postgres in prod). */
type Db = PgDatabase<any, any, any>;

/** A target state channel to mark stale (no data — clients refetch on demand). */
export type TouchTarget = { channel: string };

/** Build a touch target from a state descriptor + params (window dims dropped). */
export function touch(state: StateChannelDescriptor, params: Record<string, unknown>): TouchTarget {
  return { channel: invalidationChannel(state, params) };
}

export type WriteOpts = { touch?: TouchTarget[] };

/** Hub subscription id for an entity topic. The `e:`/`c:` prefixes keep entity and channel namespaces disjoint. */
export const entitySubscription = (name: string, id: string): string => `e:${name}:${id}`;
/** Hub subscription id for a state invalidation channel. */
export const channelSubscription = (channel: string): string => `c:${channel}`;

/** The session id itself, or a request-like carrying it in the RXFY_SESSION_HEADER header. */
export type SessionSource = SessionId | { headers: { get: (name: string) => string | null } };

export type ServerConfig = {
  db: Db;
  resources: ResourceRegistry;
  hub: Hub;
};

export type Live = {
  readonly db: Db;
  update: <TTable extends PgTable>(
    resource: Resource<TTable>,
    id: string,
    values: Partial<InferInsertModel<TTable>>,
    opts?: WriteOpts,
    // @todo this must not return undefined
  ) => Promise<InferSelectModel<TTable> | undefined>;
  create: <TTable extends PgTable>(
    resource: Resource<TTable>,
    values: InferInsertModel<TTable>,
    opts?: WriteOpts,
    // @todo this must not return undefined
  ) => Promise<InferSelectModel<TTable> | undefined>;
  delete: (resource: AnyResource, id: string, opts?: WriteOpts) => Promise<void>;
  touch: (...targets: TouchTarget[]) => void;
  /** Pass-through: registers what `data` contains as the session's live subscriptions, returns `data` unchanged. */
  serve: <TParams, TShape>(
    req: SessionSource,
    state: StateDescriptor<TParams, TShape, any, any, any>,
    params: TParams,
    data: TShape,
  ) => TShape;
  /** One-call SSR payload: mints a session, registers the render registry's contents, returns the hydration script. */
  hydration: (registry: IModelRegistry) => string;
};

export function createServer({ db, resources, hub }: ServerConfig): Live {
  const pkColumn = (resource: AnyResource): PgColumn =>
    getTableColumns(resource.table)[resource.primaryKeyColumn] as PgColumn;

  const publishEntity = (name: string, id: string, row: unknown): void => {
    hub.publish(entitySubscription(name, id), patch(name, id, row));
  };

  const applyTouch = (targets: TouchTarget[] | undefined): void => {
    for (const target of targets ?? []) {
      hub.publish(channelSubscription(target.channel), stale(target.channel));
    }
  };

  /** Subscription ids for everything a populated registry holds: resource-backed entities + logged channels. */
  const subscriptionIds = (registry: IModelRegistry): string[] => {
    const byModelKey = new Map(resources.all().map((r) => [r.model._key, r]));
    const ids: string[] = [];
    for (const { descriptor, store } of registry.stores()) {
      const resource = byModelKey.get(descriptor._key);
      if (!resource) continue; // no live resource — a client-only model, nothing will be pushed
      for (const [key] of store.valueEntries()) ids.push(entitySubscription(resource.name, key));
    }
    for (const channel of registry.channels.all()) ids.push(channelSubscription(channel));
    return ids;
  };

  const sessionOf = (req: SessionSource): SessionId | undefined =>
    typeof req === "string" ? req : (req.headers.get(RXFY_SESSION_HEADER) ?? undefined);

  return {
    db,
    async update(resource, id, values, opts) {
      const rows = await db
        .update(resource.table)
        .set(values as never)
        .where(eq(pkColumn(resource), id))
        .returning();
      const row = (rows as unknown[])[0];
      if (row !== undefined) publishEntity(resource.name, id, row);
      applyTouch(opts?.touch);
      return row as never;
    },
    async create(resource, values, opts) {
      const rows = await db
        .insert(resource.table)
        .values(values as never)
        .returning();
      applyTouch(opts?.touch);
      return (rows as unknown[])[0] as never;
    },
    async delete(resource, id, opts) {
      await db.delete(resource.table).where(eq(pkColumn(resource), id));
      applyTouch(opts?.touch);
    },
    touch(...targets) {
      applyTouch(targets);
    },
    serve(req, state, params, data) {
      const session = sessionOf(req);
      if (!session) return data; // no session header — a non-live consumer (curl, server-to-server)
      const registry = createModelRegistry();
      normalizeResult(registry, state.fields, data);
      const channel = stateChannel(state, params as Record<string, unknown>);
      if (channel) registry.channels.add(channel);
      hub.subscribe(session, subscriptionIds(registry));
      return data;
    },
    hydration(registry) {
      const session = randomUUID();
      hub.subscribe(session, subscriptionIds(registry));
      return hydrationScript({ ...dehydrate(registry), session });
    },
  };
}
```

Note the deletions: `GrantSpec`, `Grants`, `grant()`, the `keyer` config field, and the `void resources` line (resources is now used).

- [ ] **Step 6.4: Rewrite state-channel.ts as a wrapper**

Replace `packages/rxfy-server/src/state-channel.ts` entirely:

```ts
import { stateChannel } from "rxfy";

/** Names of params that slice *within* a dataset (page, cursor, sort) — excluded from the channel. */
export type WindowSpec = readonly string[];

/** The minimal shape `invalidationChannel` needs from a state descriptor. */
export type StateChannelDescriptor = {
  key: string;
  window?: WindowSpec;
};

/**
 * Derive the invalidation channel for a state instance. Thin wrapper over rxfy core's
 * `stateChannel` — `key` is required here, so the result is always a string.
 */
export function invalidationChannel(state: StateChannelDescriptor, params: Record<string, unknown>): string {
  return stateChannel(state, params) as string;
}
```

`state-channel.test.ts` tests `invalidationChannel` behavior and should pass unchanged — run it to confirm.

- [ ] **Step 6.5: Delete the keyer, fix the barrel, check browser.ts**

```bash
git rm packages/rxfy-server/src/topic-key.ts packages/rxfy-server/src/topic-key.test.ts
```

In `packages/rxfy-server/src/index.ts`, delete the line `export * from "./topic-key.js";`.

Read `packages/rxfy-server/src/browser.ts` — if it re-exports `topic-key.js`, remove that line (it should only carry resource/state-channel exports; `node:crypto` was never browser-safe).

- [ ] **Step 6.6: Run to verify it passes**

Run: `pnpm turbo test --filter=rxfy-server`
Expected: PASS. If existing tests still reference `createTopicKeyer`/`keyer`/hashed ids, finish adapting them per Step 6.1.

- [ ] **Step 6.7: Commit**

```bash
git add -A packages/rxfy-server
git commit -m "feat(rxfy-server): serve/hydration session registration; keyer and grants removed"
```

---

### Task 7: `rxfy-ws` — server binds sessions on hello

**Files:**
- Rewrite: `packages/rxfy-ws/src/server.ts`
- Rewrite: `packages/rxfy-ws/src/server.test.ts`

- [ ] **Step 7.1: Write the failing tests**

Replace `packages/rxfy-ws/src/server.test.ts` entirely:

```ts
import { hello, parseServerMessage, serialize, stale } from "rxfy-protocol";
import { createInMemoryHub } from "rxfy-server";
import { describe, expect, it } from "vitest";
import { createWsServer, type ServerSocket } from "./server.js";

function fakeSocket() {
  const sent: string[] = [];
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const socket: ServerSocket = {
    send: (data) => sent.push(data),
    on: (event, listener) => void listeners.set(event, listener),
  };
  return {
    socket,
    sent,
    emit: (event: string, ...args: unknown[]) => listeners.get(event)?.(...args),
  };
}

describe("createWsServer", () => {
  it("hello binds the session; hub publishes reach the socket", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub);
    const { socket, sent, emit } = fakeSocket();
    ws.handleConnection(socket);

    hub.subscribe("s1", ["c:todos"]); // written by the serve path
    emit("message", serialize(hello("s1")));
    hub.publish("c:todos", stale("todos"));

    expect(sent).toHaveLength(1);
    expect(parseServerMessage(sent[0]!)).toEqual({ v: 2, kind: "stale", channel: "todos" });
  });

  it("close releases the session but keeps its subscriptions until ttl", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const ws = createWsServer(hub);
    const a = fakeSocket();
    ws.handleConnection(a.socket);
    hub.subscribe("s1", ["c:todos"]);
    a.emit("message", serialize(hello("s1")));
    a.emit("close");

    // reconnect within ttl: a new socket re-hellos and delivery resumes
    t = 50;
    const b = fakeSocket();
    ws.handleConnection(b.socket);
    b.emit("message", serialize(hello("s1")));
    hub.publish("c:todos", stale("todos"));
    expect(a.sent).toHaveLength(0);
    expect(b.sent).toHaveLength(1);
  });

  it("a stale close from a replaced socket does not release the session", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub);
    const a = fakeSocket();
    const b = fakeSocket();
    ws.handleConnection(a.socket);
    ws.handleConnection(b.socket);
    hub.subscribe("s1", ["c:todos"]);
    a.emit("message", serialize(hello("s1")));
    b.emit("message", serialize(hello("s1"))); // reconnect replaced socket a
    a.emit("close"); // old socket closes late
    hub.publish("c:todos", stale("todos"));
    expect(b.sent).toHaveLength(1);
  });

  it("ignores malformed frames", () => {
    const hub = createInMemoryHub();
    const ws = createWsServer(hub);
    const { emit } = fakeSocket();
    expect(() => emit("message", "not json")).not.toThrow();
  });
});
```

- [ ] **Step 7.2: Run to verify it fails**

Run: `pnpm --filter rxfy-ws exec vitest run src/server.test.ts`
Expected: FAIL (old server still routes subscribe frames; `v: 2` mismatches).

- [ ] **Step 7.3: Implement**

Replace `packages/rxfy-ws/src/server.ts` entirely:

```ts
import { parseClientMessage, serialize } from "rxfy-protocol";
import type { Hub, SessionId } from "rxfy-server";

/** The minimal socket shape the adapter needs (satisfied structurally by a `ws` WebSocket). */
export type ServerSocket = {
  send: (data: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

/**
 * Bridges a Hub to WebSocket connections. Clients identify with a `hello` frame; the hub routes
 * pushes by session. Subscriptions are written server-side by the serve path — no subscribe frames.
 */
export function createWsServer(hub: Hub): { handleConnection: (socket: ServerSocket) => void } {
  const sockets = new Map<SessionId, ServerSocket>();
  hub.onPublish((session, message) => {
    sockets.get(session)?.send(serialize(message));
  });

  return {
    handleConnection(socket) {
      let session: SessionId | undefined;

      socket.on("message", (data: unknown) => {
        const text = typeof data === "string" ? data : (data as { toString(): string }).toString();
        let frame;
        try {
          frame = parseClientMessage(text);
        } catch {
          return;
        }
        // hello is the only client frame: bind this socket as the session's delivery target.
        session = frame.session;
        sockets.set(session, socket);
        hub.bind(session);
      });

      socket.on("close", () => {
        if (!session) return;
        // A reconnect may already have replaced this socket; only the current holder releases.
        if (sockets.get(session) === socket) {
          sockets.delete(session);
          hub.release(session);
        }
      });
    },
  };
}
```

- [ ] **Step 7.4: Run to verify it passes**

Run: `pnpm --filter rxfy-ws exec vitest run src/server.test.ts`
Expected: PASS. (client/integration tests fixed next task.)

- [ ] **Step 7.5: Commit**

```bash
git add packages/rxfy-ws/src/server.ts packages/rxfy-ws/src/server.test.ts
git commit -m "feat(rxfy-ws): hello-driven session binding on the server"
```

---

### Task 8: `rxfy-ws` — hello-replaying client transport

**Files:**
- Modify: `packages/rxfy-ws/src/client.ts`
- Rewrite: `packages/rxfy-ws/src/client.test.ts`
- Rewrite: `packages/rxfy-ws/src/integration.test.ts`

- [ ] **Step 8.1: Write the failing tests**

Replace `packages/rxfy-ws/src/client.test.ts` entirely:

```ts
import { hello, parseClientMessage, serialize, stale } from "rxfy-protocol";
import { describe, expect, it, vi } from "vitest";
import { createWsClient, type WebSocketLike } from "./client.js";

function fakeWebSocket() {
  const sent: string[] = [];
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  const ws: WebSocketLike & { open: () => void; emitClose: () => void; emitMessage: (data: string) => void } = {
    readyState: 0,
    send: (data: string) => sent.push(data),
    close: () => {},
    addEventListener: (type, listener) => {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    open() {
      ws.readyState = 1;
      for (const l of listeners.get("open") ?? []) l({});
    },
    emitClose() {
      ws.readyState = 3;
      for (const l of listeners.get("close") ?? []) l({});
    },
    emitMessage(data: string) {
      for (const l of listeners.get("message") ?? []) l({ data });
    },
  };
  return { ws, sent };
}

describe("createWsClient", () => {
  it("sends hello once open and replays it on reconnect", () => {
    vi.useFakeTimers();
    const sockets: ReturnType<typeof fakeWebSocket>[] = [];
    const transport = createWsClient({
      url: "ws://x",
      WebSocketImpl: () => {
        const s = fakeWebSocket();
        sockets.push(s);
        return s.ws;
      },
      reconnectDelayMs: 10,
    });

    sockets[0]!.ws.open();
    transport.hello("sess-1");
    expect(sockets[0]!.sent.map((m) => parseClientMessage(m))).toEqual([hello("sess-1")]);

    sockets[0]!.ws.emitClose();
    vi.advanceTimersByTime(10); // reconnect
    sockets[1]!.ws.open();
    expect(sockets[1]!.sent.map((m) => parseClientMessage(m))).toEqual([hello("sess-1")]);
    transport.close();
    vi.useRealTimers();
  });

  it("buffers hello until the socket opens", () => {
    const sockets: ReturnType<typeof fakeWebSocket>[] = [];
    const transport = createWsClient({
      url: "ws://x",
      WebSocketImpl: () => {
        const s = fakeWebSocket();
        sockets.push(s);
        return s.ws;
      },
    });
    transport.hello("sess-1"); // socket not open yet — nothing sent, but remembered
    expect(sockets[0]!.sent).toEqual([]);
    sockets[0]!.ws.open();
    expect(sockets[0]!.sent.map((m) => parseClientMessage(m))).toEqual([hello("sess-1")]);
    transport.close();
  });

  it("delivers parsed server messages to the handler", () => {
    const sockets: ReturnType<typeof fakeWebSocket>[] = [];
    const transport = createWsClient({
      url: "ws://x",
      WebSocketImpl: () => {
        const s = fakeWebSocket();
        sockets.push(s);
        return s.ws;
      },
    });
    const seen: unknown[] = [];
    transport.onMessage((m) => seen.push(m));
    sockets[0]!.ws.emitMessage(serialize(stale("todos")));
    expect(seen).toEqual([stale("todos")]);
    transport.close();
  });
});
```

- [ ] **Step 8.2: Run to verify it fails**

Run: `pnpm --filter rxfy-ws exec vitest run src/client.test.ts`
Expected: FAIL — `transport.hello` does not exist.

- [ ] **Step 8.3: Implement**

In `packages/rxfy-ws/src/client.ts`:

1. Change the import: `import { hello as helloFrame, parseServerMessage, serialize, type ServerMessage } from "rxfy-protocol";` (drop `subscribe as subscribeFrame, unsubscribe as unsubscribeFrame`).
2. Replace `ClientTransport`:

```ts
export type ClientTransport = {
  /** Announce the session; automatically re-sent on every reconnect. */
  hello: (session: string) => void;
  /** Register the inbound-message handler. Single slot — a later call replaces the previous handler. */
  onMessage: (handler: (message: ServerMessage) => void) => void;
  close: () => void;
};
```

3. In `createWsClient`, replace `const active = new Set<string>();` with `let session: string | undefined;`. In `connect()`'s `"open"` listener, replace the active-set replay with:

```ts
    socket.addEventListener("open", () => {
      if (session) send(serialize(helloFrame(session)));
    });
```

4. Replace the returned `subscribe`/`unsubscribe` methods with:

```ts
    hello(next) {
      session = next;
      send(serialize(helloFrame(next)));
    },
```

(`send` already no-ops when the socket isn't OPEN, giving the "buffer until open" behavior — the open listener replays it.)

- [ ] **Step 8.4: Rewrite the integration test**

Replace `packages/rxfy-ws/src/integration.test.ts` entirely:

```ts
import { patch, stale } from "rxfy-protocol";
import { createInMemoryHub } from "rxfy-server";
import { describe, expect, it } from "vitest";
import { createWsClient, type WebSocketLike } from "./client.js";
import { createWsServer, type ServerSocket } from "./server.js";

/** An in-process socket pair: the client's WebSocketLike wired directly to a ServerSocket. */
function socketPair(server: ReturnType<typeof createWsServer>) {
  const serverListeners = new Map<string, (...args: unknown[]) => void>();
  const clientListeners = new Map<string, Array<(event: unknown) => void>>();
  const serverSocket: ServerSocket = {
    send: (data) => {
      for (const l of clientListeners.get("message") ?? []) l({ data });
    },
    on: (event, listener) => void serverListeners.set(event, listener),
  };
  const clientSocket: WebSocketLike = {
    readyState: 1,
    send: (data: string) => serverListeners.get("message")?.(data),
    close: () => serverListeners.get("close")?.(),
    addEventListener: (type, listener) => {
      const list = clientListeners.get(type) ?? [];
      list.push(listener);
      clientListeners.set(type, list);
      if (type === "open") listener({}); // already open
    },
  };
  server.handleConnection(serverSocket);
  return clientSocket;
}

describe("ws client/server integration", () => {
  it("hello binds; serve-path subscriptions flow patches and stales to the client", () => {
    const hub = createInMemoryHub();
    const server = createWsServer(hub);
    const transport = createWsClient({ url: "ws://x", WebSocketImpl: () => socketPair(server) });

    hub.subscribe("s1", ["e:todo:1", "c:todos"]); // what the serve path would write
    transport.hello("s1");

    const seen: unknown[] = [];
    transport.onMessage((m) => seen.push(m));
    hub.publish("e:todo:1", patch("todo", "1", { id: "1", done: true }));
    hub.publish("c:todos", stale("todos"));

    expect(seen).toEqual([patch("todo", "1", { id: "1", done: true }), stale("todos")]);
    transport.close();
  });
});
```

- [ ] **Step 8.5: Run to verify it passes**

Run: `pnpm turbo test --filter=rxfy-ws`
Expected: PASS.

- [ ] **Step 8.6: Commit**

```bash
git add packages/rxfy-ws/src
git commit -m "feat(rxfy-ws): hello-replaying client transport"
```

---

### Task 9: `rxfy-react` — channel from core + SSR channel recording

**Files:**
- Delete: `packages/rxfy-react/src/live/channel.ts`, `packages/rxfy-react/src/live/channel.test.ts` (cases already ported to core in Task 1)
- Modify: `packages/rxfy-react/src/useStateData.ts` (imports ~line 26; record after ~line 98)
- Modify: `packages/rxfy-react/src/index.tsx` (lines 1–2)
- Modify: `packages/rxfy-react/src/useStateData.server.test.tsx` (add one test)

- [ ] **Step 9.1: Write the failing test**

In `packages/rxfy-react/src/useStateData.server.test.tsx`, add (inside the existing describe, reusing the file's existing SSR render helpers — it already renders hooks with `ssr` + a registry):

```tsx
it("records the state's channel into registry.channels during SSR", async () => {
  const registry = createModelRegistry();
  // render the same keyed-state component the other SSR tests in this file render,
  // passing `registry` — then:
  expect(registry.channels.all()).toContain("<the state's channel, e.g. its key>");
});
```

Match the fixture state used by the neighboring tests in that file (use its key as the expected channel; if the fixture declares window params, expect the windowless channel).

- [ ] **Step 9.2: Run to verify it fails**

Run: `pnpm --filter rxfy-react exec vitest run src/useStateData.server.test.tsx`
Expected: FAIL — `registry.channels.all()` is empty.

- [ ] **Step 9.3: Implement**

1. In `packages/rxfy-react/src/useStateData.ts`: delete `import { stateChannel } from "./live/channel.js";` and add `stateChannel` to the existing value-import block from `"rxfy"` (the one with `attachReload, createAtom, ...`).
2. After the line `const channel = stateChannel(state, params as Record<string, unknown>);` add:

```ts
  // During SSR, log the channel so live.hydration can register this session's subscription.
  if (typeof window === "undefined" && ssr && channel) registry.channels.add(channel);
```

3. Delete the react copy:

```bash
git rm packages/rxfy-react/src/live/channel.ts packages/rxfy-react/src/live/channel.test.ts
```

4. In `packages/rxfy-react/src/index.tsx`, replace lines 1–2 with re-exports from core (public API preserved):

```ts
export type { ChannelStateDescriptor } from "rxfy";
export { stateChannel } from "rxfy";
```

5. Check for other importers: `grep -rn "live/channel" packages/rxfy-react/src` — fix any hit the same way (import from `"rxfy"`).

- [ ] **Step 9.4: Run to verify it passes**

Run: `pnpm turbo test --filter=rxfy-react`
Expected: the new test passes; `live-client.test.ts` and `read-grants.test.ts` still pass (they're rewritten in Task 10 — if this task's changes broke their compilation, proceed to Task 10 and run both together).

- [ ] **Step 9.5: Commit**

```bash
git add -A packages/rxfy-react
git commit -m "feat(rxfy-react): use core stateChannel; record SSR channels on the registry"
```

---

### Task 10: `rxfy-react` — sink-only live client + `readSsrSession`

**Files:**
- Rewrite: `packages/rxfy-react/src/live/live-client.ts`
- Rewrite: `packages/rxfy-react/src/live/live-client.test.ts`
- Delete: `packages/rxfy-react/src/live/read-grants.ts`, `packages/rxfy-react/src/live/read-grants.test.ts`
- Create: `packages/rxfy-react/src/live/read-session.ts`, `packages/rxfy-react/src/live/read-session.test.ts`
- Modify: `packages/rxfy-react/src/index.tsx` (exports, lines 3–5)
- Modify: `packages/rxfy-react/src/useStateData.live.test.tsx` (stub client, ~line 28)

- [ ] **Step 10.1: Write the failing tests**

Replace `packages/rxfy-react/src/live/live-client.test.ts` entirely:

```ts
import { createModel, createModelRegistry } from "rxfy";
import { patch, type ServerMessage, stale } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLiveClient, type LiveTransport } from "./live-client.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

function fakeTransport() {
  let handler: ((m: ServerMessage) => void) | undefined;
  const hellos: string[] = [];
  const transport: LiveTransport = {
    hello: (session) => hellos.push(session),
    onMessage: (h) => {
      handler = h;
    },
  };
  return { transport, hellos, deliver: (m: ServerMessage) => handler?.(m) };
}

describe("createLiveClient", () => {
  it("announces the session via hello", () => {
    const registry = createModelRegistry();
    const { transport, hellos } = fakeTransport();
    createLiveClient({ registry, transport, session: "sess-1" });
    expect(hellos).toEqual(["sess-1"]);
  });

  it("applies an inbound patch to the matching store", () => {
    const registry = createModelRegistry();
    registry.model(postModel).setMany([{ id: "1", title: "old" }]);
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport, session: "sess-1" });
    deliver(patch("post", "1", { id: "1", title: "new" }));
    expect(registry.model(postModel).getValue("1")).toEqual({ id: "1", title: "new" });
  });

  it("counts stale signals per channel and resets", () => {
    const registry = createModelRegistry();
    const { transport, deliver } = fakeTransport();
    const live = createLiveClient({ registry, transport, session: "sess-1" });
    const ch = live.channel("posts:orgId=A");
    const seen: number[] = [];
    ch.available$.subscribe((v) => seen.push(v));
    deliver(stale("posts:orgId=A"));
    deliver(stale("posts:orgId=A"));
    ch.reset();
    expect(seen).toEqual([0, 1, 2, 0]);
  });

  it("ignores stale for a channel with no local counter", () => {
    const registry = createModelRegistry();
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport, session: "sess-1" });
    expect(() => deliver(stale("unknown"))).not.toThrow();
  });

  it("ignores a patch for a store that is not in the registry (no-op)", () => {
    const registry = createModelRegistry();
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport, session: "sess-1" });
    expect(() => deliver(patch("nonexistent", "1", { id: "1" }))).not.toThrow();
  });
});
```

Create `packages/rxfy-react/src/live/read-session.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { readSsrSession } from "./read-session.js";

type SsrGlobal = { __RXFY_SSR__?: Array<{ session?: string }> };

afterEach(() => {
  delete (globalThis as SsrGlobal).__RXFY_SSR__;
});

describe("readSsrSession", () => {
  it("returns undefined with no hydration chunks", () => {
    expect(readSsrSession()).toBeUndefined();
  });

  it("returns the first session found in the chunks", () => {
    (globalThis as SsrGlobal).__RXFY_SSR__ = [{}, { session: "sess-1" }, { session: "sess-2" }];
    expect(readSsrSession()).toBe("sess-1");
  });
});
```

- [ ] **Step 10.2: Run to verify it fails**

Run: `pnpm --filter rxfy-react exec vitest run src/live`
Expected: FAIL — old transport shape; `read-session.js` missing.

- [ ] **Step 10.3: Implement**

Replace `packages/rxfy-react/src/live/live-client.ts` entirely:

```ts
import type { IModelRegistry } from "rxfy";
import type { ServerMessage } from "rxfy-protocol";
import { BehaviorSubject, type Observable } from "rxjs";

/** Structural transport (satisfied by rxfy-ws/client's ClientTransport). */
export type LiveTransport = {
  hello: (session: string) => void;
  onMessage: (handler: (message: ServerMessage) => void) => void;
};

export type ChannelCounter = {
  available$: Observable<number>;
  reset: () => void;
};

export type LiveClient = {
  channel: (channel: string) => ChannelCounter;
  stop: () => void;
};

export type LiveClientConfig = {
  registry: IModelRegistry;
  transport: LiveTransport;
  /** This page load's session id — the server pushes updates for everything it serves this session. */
  session: string;
};

/**
 * A pure sink: the server tracks what this session was served and pushes updates for it. Patches
 * land in the model stores in place; stales bump the matching channel counter. The client never
 * subscribes to anything — its entire outbound protocol is the hello.
 */
export function createLiveClient({ registry, transport, session }: LiveClientConfig): LiveClient {
  const counters = new Map<string, BehaviorSubject<number>>();

  transport.onMessage((message) => {
    if (message.kind === "patch") {
      registry
        .namedStores()
        .get(message.name)
        ?.set(message.id, message.data as unknown);
    } else {
      const counter = counters.get(message.channel);
      if (counter) counter.next(counter.value + 1);
    }
  });

  transport.hello(session);

  return {
    channel(channel) {
      let counter = counters.get(channel);
      if (!counter) {
        counter = new BehaviorSubject(0);
        counters.set(channel, counter);
      }
      const subject = counter;
      return { available$: subject.asObservable(), reset: () => subject.next(0) };
    },
    stop() {
      for (const counter of counters.values()) counter.complete();
      counters.clear();
    },
  };
}
```

Create `packages/rxfy-react/src/live/read-session.ts`:

```ts
/** First `session` present in the SSR hydration chunks (all chunks of one request share it). */
export function readSsrSession(): string | undefined {
  const chunks = (globalThis as { __RXFY_SSR__?: Array<{ session?: string }> }).__RXFY_SSR__ ?? [];
  for (const chunk of chunks) {
    if (typeof chunk.session === "string") return chunk.session;
  }
  return undefined;
}
```

Delete the grants reader:

```bash
git rm packages/rxfy-react/src/live/read-grants.ts packages/rxfy-react/src/live/read-grants.test.ts
```

In `packages/rxfy-react/src/index.tsx`, replace lines 3–5 with:

```ts
export type { ChannelCounter, LiveClient, LiveClientConfig, LiveTransport } from "./live/live-client.js";
export { createLiveClient } from "./live/live-client.js";
export { readSsrSession } from "./live/read-session.js";
export { RXFY_SESSION_HEADER } from "rxfy-protocol";
```

In `packages/rxfy-react/src/useStateData.live.test.tsx` line ~28, the stub client loses `addGrants`:

```ts
  const client: LiveClient = { channel, stop: vi.fn() };
```

- [ ] **Step 10.4: Run to verify it passes**

Run: `pnpm turbo test --filter=rxfy-react`
Expected: PASS across the whole package.

- [ ] **Step 10.5: Commit**

```bash
git add -A packages/rxfy-react
git commit -m "feat(rxfy-react): sink-only live client with session hello; readSsrSession replaces readSsrGrants"
```

---

### Task 11: Template migration (`templates/vite`)

**Files:**
- Create: `templates/vite/src/session.ts`
- Modify: `templates/vite/src/api-client.ts`, `templates/vite/src/entry-client.tsx`, `templates/vite/src/entry-server.tsx`, `templates/vite/server/api.ts`, `templates/vite/server/live.ts`, `templates/vite/server/render.ts`
- Delete: `templates/vite/src/live-singleton.ts`, `templates/vite/src/routes.ts`
- Modify: `templates/vite/src/ssr.smoke.test.ts`, `templates/vite/server/live.smoke.test.ts`
- Unchanged: `templates/vite/server/ws.ts` (createWsServer(hub) signature is the same)

**Critical wiring note:** in dev, `entry-server.tsx` is loaded through Vite's SSR module graph while `server/*` runs in the tsx graph — two module instances. Hub subscriptions are now *state*, so the SSR render MUST use the tsx-graph `live` instance. Fix: `render(url, live)` — the server passes its `live` in; `entry-server.tsx` stops importing `../server/live.js` entirely.

- [ ] **Step 11.1: Update the smoke tests first (they define done)**

`templates/vite/src/ssr.smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { initDb } from "../server/db.js";
import { live } from "../server/live.js";
import { render } from "./entry-server.js";

describe("SSR", () => {
  it("renders the todos page with data resolved and a hydration payload", async () => {
    await initDb();
    const { html, state } = await render("/", live);
    // Seeded todo is in the first-paint HTML — no PENDING flash.
    expect(html).toContain("Open this app in a second tab");
    expect(html).not.toContain("Loading…");
    // Hydration payload + the live session id ride along in <!--app-state-->.
    expect(state).toContain("__RXFY_SSR__");
    expect(state).toContain("session");
  }, 30_000);
});
```

`templates/vite/server/live.smoke.test.ts` — change the imports and hub subscriptions (body otherwise unchanged):

```ts
import type { PublishSink, Resource } from "rxfy-server";
import { createInMemoryHub, createServer, touch } from "rxfy-server";
import { describe, expect, it } from "vitest";
import { resources, todoResource } from "../src/resources.js";
import { todosChannel } from "./api.js";
import type { todos } from "./db.js";
```

- delete the `createTopicKeyer` import and every `const keyer = ...` line;
- `createServer({ db, resources, hub })`;
- `hub.subscribe("client", ["c:todos"])` in the create test, `hub.subscribe("client", ["e:todo:t1"])` in the update test;
- expected messages become `{ v: 2, ... }`.

- [ ] **Step 11.2: Run to verify they fail**

Run: `pnpm --filter rxfy-template-vite test` (check the actual package name in `templates/vite/package.json` first; use `pnpm turbo test --filter=<name>`)
Expected: FAIL — `render` takes one arg; `todosChannel` not exported from api.

- [ ] **Step 11.3: New session module**

Create `templates/vite/src/session.ts`:

```ts
import { readSsrSession } from "rxfy-react";

/** This page load's live session: adopted from the SSR payload, or minted fresh for client-only loads. */
export const sessionId = readSsrSession() ?? crypto.randomUUID();
```

- [ ] **Step 11.4: api-client + entry-client; delete the singleton**

`templates/vite/src/api-client.ts`:

```ts
import { hc } from "hono/client";
import { RXFY_SESSION_HEADER } from "rxfy-react";
import type { AppType } from "../server/api.js";
import { sessionId } from "./session.js";
import type { Todo } from "./todos.js";

const client = hc<AppType>("/api", { headers: { [RXFY_SESSION_HEADER]: sessionId } });

export async function fetchTodos(): Promise<{ todos: Todo[] }> {
  // Build-time constant: the server-only branch and its PGlite import are eliminated
  // from the client bundle. Must stay inline — hoisting it to a const regresses that.
  if (import.meta.env.SSR) {
    const { asc } = await import("drizzle-orm");
    const { db, todos } = await import("../server/db.js");
    const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
    return { todos: rows };
  }
  const res = await client.todos.$get();
  return (await res.json()) as { todos: Todo[] };
}

export const createTodo = (title: string) => client.todos.$post({ json: { title } });

export const toggleTodo = (id: string, done: boolean) => client.todos[":id"].$patch({ param: { id }, json: { done } });
```

`templates/vite/src/entry-client.tsx`:

```tsx
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { createModelRegistry } from "rxfy";
import { createLiveClient, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { App } from "./App.js";
import { sessionId } from "./session.js";

const registry = createModelRegistry();
const liveClient = createLiveClient({
  registry,
  transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
  session: sessionId,
});

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider registry={registry} ssr liveClient={liveClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StoreProvider>
  </StrictMode>,
);
```

```bash
git rm templates/vite/src/live-singleton.ts
```

- [ ] **Step 11.5: entry-server takes `live`; routes.ts dies**

`templates/vite/src/entry-server.tsx`:

```tsx
import { PassThrough } from "node:stream";
import { StrictMode, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router";
import { createModelRegistry } from "rxfy";
import { StoreProvider } from "rxfy-react";
import type { Live } from "rxfy-server";
import { App } from "./App.js";

/** `live` is injected by the caller so dev's two module graphs share ONE hub (the tsx-graph instance). */
export function render(url: string, live: Live): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry();

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <Suspense fallback={null}>
            <StaticRouter location={url}>
              <App />
            </StaticRouter>
          </Suspense>
        </StoreProvider>
      </StrictMode>,
      {
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => {
            // Registers everything this render fetched as the session's live subscriptions
            // and embeds the session id in the hydration payload.
            resolve({ html, state: live.hydration(registry) });
          });
          pipe(sink);
        },
        onError: (error) => reject(error instanceof Error ? error : new Error(String(error))),
      },
    );
  });
}
```

```bash
git rm templates/vite/src/routes.ts
```

`templates/vite/server/render.ts` — thread `live` through:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Live } from "rxfy-server";
import type { ViteDevServer } from "vite";
import { live } from "./live.js";

type RenderFn = (url: string, live: Live) => Promise<{ html: string; state: string }>;

export async function renderPage(url: string, vite: ViteDevServer | undefined, isProduction: boolean): Promise<string> {
  let template: string;
  let render: RenderFn;
  if (!isProduction) {
    template = await fs.readFile("./index.html", "utf-8");
    template = await vite!.transformIndexHtml(url, template);
    render = (await vite!.ssrLoadModule("/src/entry-server.tsx")).render as RenderFn;
  } else {
    template = await fs.readFile("./dist/client/index.html", "utf-8");
    const entryUrl = pathToFileURL(path.resolve(process.cwd(), "dist/server/entry-server.js")).href;
    render = ((await import(entryUrl)) as { render: RenderFn }).render;
  }
  const rendered = await render(url, live);
  return template.replace("<!--app-html-->", () => rendered.html).replace("<!--app-state-->", () => rendered.state);
}
```

- [ ] **Step 11.6: server/live.ts and server/api.ts**

`templates/vite/server/live.ts`:

```ts
import { createInMemoryHub, createServer } from "rxfy-server";
import { resources } from "../src/resources.js";
import { db } from "./db.js";

// The hub holds live session subscriptions, so there must be exactly ONE instance — the tsx-graph
// one. entry-server receives `live` as a parameter instead of importing this module, so the Vite
// SSR graph never instantiates a second hub.
export const hub = createInMemoryHub();

export const live = createServer({ db, resources, hub });
```

`templates/vite/server/api.ts`:

```ts
import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { type Resource, type StateChannelDescriptor, touch } from "rxfy-server";
import { todoResource } from "../src/resources.js";
import { todosState } from "../src/todos.js";
import { db, todos } from "./db.js";
import { live } from "./live.js";

// StateDescriptor.key is `string | undefined` in rxfy but StateChannelDescriptor requires `string`;
// todosState supplies a key, so the cast is safe.
export const todosChannel = todosState as unknown as StateChannelDescriptor;

// live.create/update accept Resource<TTable> with the table's raw row shape; the model omits
// `createdAt`, so re-view the resource as its raw-row writer resource.
const todoWriteResource = todoResource as unknown as Resource<typeof todos>;

const newId = () => crypto.randomUUID();

export const api = new Hono()
  .get("/todos", async (c) => {
    const rows = await db.select().from(todos).orderBy(asc(todos.createdAt), asc(todos.id));
    // serve() is a pass-through: registers this session's live subscriptions, returns the data as-is.
    return c.json(live.serve(c.req.raw, todosState, {}, { todos: rows }));
  })
  .post(
    "/todos",
    // Type-cast only — swap in real validation (e.g. zod) before accepting untrusted input.
    validator("json", (v) => v as { title: string }),
    async (c) => {
      const { title } = c.req.valid("json");
      const row = await live.create(
        todoWriteResource,
        { id: newId(), title, done: false },
        { touch: [touch(todosChannel, {})] },
      );
      return c.json(row);
    },
  )
  .patch(
    "/todos/:id",
    validator("json", (v) => v as { done: boolean }),
    async (c) => {
      const { done } = c.req.valid("json");
      const row = await live.update(todoWriteResource, c.req.param("id"), { done });
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json(row);
    },
  );

export type AppType = typeof api;
```

- [ ] **Step 11.7: Sweep for stragglers**

```bash
grep -rn "routeStates\|live-singleton\|readSsrGrants\|addGrants\|createTopicKeyer\|RXFY_SECRET\|grants" templates/vite/src templates/vite/server templates/vite/README.md 2>/dev/null
```

Fix every hit (README: replace any grant/RXFY_SECRET description with a sentence on sessions: "The server tracks what each browser session was served and pushes updates over the WebSocket — see `live.serve` in server/api.ts and `live.hydration` in src/entry-server.tsx.").

- [ ] **Step 11.8: Run to verify it passes**

Run: `pnpm turbo test --filter=<template package name>` and `pnpm turbo check-types --filter=<template package name>`
Expected: PASS (both smoke tests).

Then verify the app end-to-end manually: `pnpm --filter <template package name> dev`, open two tabs at `http://localhost:3000`, add a todo in tab A → the "N new — refresh" badge appears in tab B; toggle a todo in tab A → the checkbox flips in tab B without refresh.

- [ ] **Step 11.9: Commit**

```bash
git add -A templates/vite
git commit -m "feat(template-vite): session-based live updates — grants flow removed"
```

---

### Task 12: Example migration (`examples/vite-blog-framework`)

Same shape as Task 11, applied to the blog example. Its extra wrinkle: two states (`postsState`, `postDetailState`) and `matchRoute` in `routes.ts` (which stays — only `routeStates` is deleted).

**Files:**
- Create: `examples/vite-blog-framework/src/session.ts` (same content as the template's, Step 11.3)
- Modify: `examples/vite-blog-framework/src/blog/api-client.ts`, `src/entry-client.tsx`, `src/entry-server.tsx`, `src/routes.ts`, `server/api.ts`, `server/live.ts`, `server/render.ts` (or wherever its render invocation lives — find with `grep -rn "entry-server" examples/vite-blog-framework/server`)
- Delete: `examples/vite-blog-framework/src/live-singleton.ts`
- Modify: `examples/vite-blog-framework/server/live.smoke.test.ts`, README.md

- [ ] **Step 12.1:** `src/routes.ts`: delete the `routeStates` function and its `StateChannelDescriptor` import; keep `matchRoute` and the `Route` type.

- [ ] **Step 12.2:** `server/live.ts`:

```ts
import { createInMemoryHub, createServer } from "rxfy-server";
import { resources } from "../src/blog/resources.js";
import { db } from "./db.js";

// One hub instance (tsx graph) — entry-server receives `live` as a parameter.
export const hub = createInMemoryHub();

export const live = createServer({ db, resources, hub });
```

- [ ] **Step 12.3:** `src/entry-server.tsx` — mirror the template: `render(url: string, live: Live)`, drop the `../server/live.js`, resource, and `routeStates` imports (keep `matchRoute` ONLY if used for something other than grants — check), and end the render with `resolve({ html, state: live.hydration(registry) });`.

- [ ] **Step 12.4:** `server/api.ts` — the two GET handlers become pass-throughs (the `postsChannel`/`postDetailChannel` casts at the top of the file stay — `touch` uses them):

```ts
// GET /posts handler body, after loading rows/authors/meta into `data`:
return c.json(live.serve(c.req.raw, postsState, {}, data));

// GET /posts/:id handler body, after loading post/author/comments into `data`:
return c.json(live.serve(c.req.raw, postDetailState, { postId }, data));
```

Delete the `createModelRegistry`/`normalizeResult` imports and the per-handler registry + `live.grant` code.

- [ ] **Step 12.5:** `src/blog/api-client.ts` — client with the session header; fetches return plain JSON:

```ts
import type { PostDetailData, PostId, PostsData } from "examples-shared";
import { hc } from "hono/client";
import { RXFY_SESSION_HEADER } from "rxfy-react";
import type { AppType } from "../../server/api.js";
import { sessionId } from "../session.js";

const isServer = typeof window === "undefined";
const client = hc<AppType>("/api", { headers: { [RXFY_SESSION_HEADER]: sessionId } });

export async function fetchPosts(): Promise<PostsData> {
  if (isServer) {
    // ... keep the existing direct-DB branch unchanged ...
  }
  const res = await client.posts.$get();
  return (await res.json()) as unknown as PostsData;
}

export async function fetchPostDetail({ postId }: { postId: PostId }): Promise<PostDetailData> {
  if (isServer) {
    // ... keep the existing direct-DB branch unchanged ...
  }
  const res = await client.posts[":id"].$get({ param: { id: postId } });
  if (!res.ok) throw new Error(`Post ${postId} not found`);
  return (await res.json()) as unknown as PostDetailData;
}

// ... write helpers unchanged ...
```

Delete the local `Grants` type, the `getLiveClient` import, and both `addGrants` calls. `git rm examples/vite-blog-framework/src/live-singleton.ts`.

- [ ] **Step 12.6:** `src/entry-client.tsx` — same change as Step 11.4 (import `sessionId` from `./session.js`, pass `session: sessionId`, drop `readSsrGrants` and the singleton).

- [ ] **Step 12.7:** Server render invocation: find where `render(` is called (`grep -rn "render(" examples/vite-blog-framework/server`) and pass `live` (import from `./live.js`), updating the local `RenderFn` type — mirror Step 11.5.

- [ ] **Step 12.8:** `server/live.smoke.test.ts` — same adaptations as Step 11.1: no keyer, `createServer({ db, resources, hub })`, raw prefixed hub ids (`["c:posts"]` / `["e:post:<id>"]` — match the channels the file asserts), `v: 2` expectations. README: update any grant/`RXFY_SECRET` mentions.

- [ ] **Step 12.9:** Verify + sweep:

```bash
grep -rn "routeStates\|live-singleton\|readSsrGrants\|addGrants\|createTopicKeyer\|RXFY_SECRET\|live.grant" examples/vite-blog-framework/src examples/vite-blog-framework/server examples/vite-blog-framework/README.md
```

Expected: no hits (ignore `dist/`). Run: `pnpm turbo test --filter=<example package name>` and `pnpm turbo check-types --filter=<example package name>`
Expected: PASS.

- [ ] **Step 12.10: Commit**

```bash
git add -A examples/vite-blog-framework
git commit -m "feat(example-vite-blog): migrate to session-based live updates"
```

---

### Task 13: Skill references (`.claude/skills/rxfy-framework`)

**Files:**
- Replace: `.claude/skills/rxfy-framework/references/grants-hydration.md` → `live-sessions.md`
- Modify: `.claude/skills/rxfy-framework/SKILL.md`, `references/framework-server.md`, `references/framework-protocol.md`, `references/framework-transport.md`, `references/live-client.md`

- [ ] **Step 13.1:** `git rm .claude/skills/rxfy-framework/references/grants-hydration.md` and create `.claude/skills/rxfy-framework/references/live-sessions.md`:

```markdown
# Live sessions

There are no grants and no client subscriptions. The server tracks what each browser session was
served and pushes updates for exactly that. The client's entire outbound protocol is one
`hello { session }` frame.

## Session identity

- SSR loads: `live.hydration(registry)` mints the session server-side and embeds it in the
  hydration payload; the client adopts it with `readSsrSession()`.
- CSR-only loads: the client mints its own id.

```ts
// src/session.ts
import { readSsrSession } from "rxfy-react";
export const sessionId = readSsrSession() ?? crypto.randomUUID();
```

Attach it to every API request and to the live client:

```ts
import { RXFY_SESSION_HEADER } from "rxfy-react";
const client = hc<AppType>("/api", { headers: { [RXFY_SESSION_HEADER]: sessionId } });

const liveClient = createLiveClient({ registry, transport: createWsClient({ url }), session: sessionId });
```

## Serving = subscribing

A read endpoint wraps its result in `live.serve` — a pass-through that returns the data unchanged
and registers the served entities + state channel under the requester's session:

```ts
.get("/todos", async (c) => {
  const rows = await db.select().from(todos);
  return c.json(live.serve(c.req.raw, todosState, {}, { todos: rows }));
})
```

Pass the SAME `params` you pass to `useStateData` — window keys are stripped internally, so the
registered channel always matches the one the client's `updatesAvailable$` counts.

SSR renders register everything at once (`useStateData` logs each rendered state's channel into
`registry.channels` during SSR; entities come from the render registry):

```ts
onAllReady() {
  // collect pipe into `html`, then:
  resolve({ html, state: live.hydration(registry) });
}
```

`render` should receive `live` as a parameter from the server entry — in dev, Vite's SSR module
graph is separate from the server's, and the hub (which now holds subscription state) must be a
single instance.

## Lifecycle

- Pushes flow once the WS `hello` binds the session; fetch-before-connect is fine (the hub record
  waits).
- Reconnect re-hellos and delivery resumes; updates published while disconnected are lost — the
  refresh badge / refetch is the recovery path.
- Sessions with no bound socket expire after the hub's `ttlMs` (default 5 min).

## What stays manual

- `touch(channelDescriptor, params)` on writes — only the app knows which lists a write invalidates.
- One `live.serve` per read endpoint — the server can't see what a plain Drizzle read served.
```

- [ ] **Step 13.2:** Update the other references (grep-driven):

```bash
grep -rn "grant\|keyer\|readSsrGrants\|addGrants\|subscribe" .claude/skills/rxfy-framework
```

- `SKILL.md`: update the reference-table row `grants-hydration.md` → `live-sessions.md` ("session identity, live.serve, live.hydration, hub TTL"); update the data-flow diagram lines (`hub.publish(patch) → WebSocket` stays; remove grant/allow-list wording); update the module table for `framework-server.md` (add `serve`, `hydration`; drop topic keyer).
- `framework-server.md`: remove the `createTopicKeyer` section; document `createServer({ db, resources, hub })`, `serve`, `hydration`, hub `bind`/`release`/TTL.
- `framework-protocol.md`: protocol v2 — `hello` is the only client frame; patch/stale unchanged.
- `framework-transport.md`: `ClientTransport` is `{ hello, onMessage, close }`; server binds sessions.
- `live-client.md`: `createLiveClient({ registry, transport, session })`, `readSsrSession`; delete `addGrants`/`readSsrGrants` docs.

- [ ] **Step 13.3: Commit**

```bash
git add -A .claude/skills
git commit -m "docs(skills): rxfy-framework references for session-based live updates"
```

---

### Task 14: Docs site (`apps/docs`)

**Files:** (grep-driven; source only — never touch `apps/docs/dist`)

- [ ] **Step 14.1:** Locate every affected page:

```bash
grep -rln "grant\|keyer\|readSsrGrants\|addGrants\|routeStates" apps/docs/src apps/docs/vocs.config.ts
```

- [ ] **Step 14.2:** Apply:
- Delete `apps/docs/src/pages/framework/server/grants.mdx` and `create-topic-keyer.mdx`; create `apps/docs/src/pages/framework/server/sessions.mdx` with the same content structure as the skill reference from Step 13.1 (adapted to the docs' mdx voice — check a neighboring page for frontmatter conventions).
- Update `vocs.config.ts` sidebar: replace the grants + create-topic-keyer entries with one `Sessions` entry pointing at `/framework/server/sessions`.
- Update code snippets in the remaining matched pages (`create-server.mdx`, `writes.mdx`, `messages.mdx`, `server.mdx`, `framework/ws/*.mdx`, `getting-started/framework.mdx`, `guides/live-blog.mdx`, `core-concepts/ssr.mdx`, `react/live-client.mdx`, `comparison.mdx`, `agent-skills.mdx`) to the new APIs shown in Tasks 6–11: `createServer({ db, resources, hub })`, `live.serve(...)`, `live.hydration(registry)`, `createLiveClient({ registry, transport, session })`, `readSsrSession`, hello-only protocol.

- [ ] **Step 14.3:** Verify the docs build: `pnpm turbo build --filter=<docs package name>` — expected PASS. Commit:

```bash
git add -A apps/docs
git commit -m "docs: session-based live updates — grants and keyer pages replaced"
```

---

### Task 15: Changeset

**Files:**
- Create: `.changeset/live-sessions.md`

- [ ] **Step 15.1:** Create `.changeset/live-sessions.md`:

```markdown
---
"rxfy": minor
"rxfy-protocol": minor
"rxfy-ws": minor
"rxfy-server": minor
"rxfy-react": minor
---

Session-based live updates — the grant flow is removed end to end.

The server now tracks what each browser session was served and pushes updates for it; clients no
longer subscribe to anything (their only outbound frame is `hello { session }`).

- `rxfy`: new `stateChannel` (canonical channel derivation), `ChannelLog`/`registry.channels`;
  the hydration payload carries `session` instead of `grants`.
- `rxfy-protocol`: protocol v2 — `hello` replaces `subscribe`/`unsubscribe`; new
  `RXFY_SESSION_HEADER`.
- `rxfy-ws`: server binds sessions on `hello`; the client transport is `{ hello, onMessage, close }`
  and replays the hello on reconnect.
- `rxfy-server`: `live.serve(req, state, params, data)` pass-through and `live.hydration(registry)`
  register subscriptions; the hub is session-keyed with a bind/release TTL; `grant`, `GrantSpec`,
  `Grants`, and `createTopicKeyer` are removed.
- `rxfy-react`: `createLiveClient({ registry, transport, session })` is a pure sink;
  `readSsrSession` replaces `readSsrGrants`; `addGrants` is removed; `useStateData` records SSR
  channels on the registry.
```

- [ ] **Step 15.2: Commit**

```bash
git add .changeset/live-sessions.md
git commit -m "chore: changeset for session-based live updates"
```

---

### Task 16: Full verification

- [ ] **Step 16.1:** Full pipeline:

```bash
pnpm turbo build && pnpm turbo test && pnpm turbo lint && pnpm turbo check-types
```

Expected: all green.

- [ ] **Step 16.2:** Residue sweep (source only):

```bash
grep -rn "readSsrGrants\|addGrants\|createTopicKeyer\|GrantSpec\|live\.grant\|routeStates\|RXFY_SECRET\|topic-key" \
  packages templates examples apps/docs/src .claude/skills --include="*.ts" --include="*.tsx" --include="*.md" --include="*.mdx" \
  | grep -v node_modules | grep -v dist | grep -v docs/superpowers
```

Expected: no hits. Fix any stragglers and amend/commit.

- [ ] **Step 16.3:** Re-run the manual two-tab check from Step 11.8 on the template (live patch + stale badge both work), and once on the example app.

---

## Self-Review Notes (already applied)

- Spec coverage: protocol v2 (T4), hub sessions/TTL (T5), serve/hydration + deletions (T6), WS layers (T7–8), core substrate (T1–3), react sink + SSR record (T9–10), template (T11), example (T12), skills/docs (T13–14), release (T15). Missed-update/resync and shared-hub multi-node are explicitly out of scope per the spec.
- Type names used across tasks: `SessionId`, `SessionSource`, `Live.serve/hydration`, `ClientTransport.hello`, `LiveTransport.hello`, `readSsrSession`, `RXFY_SESSION_HEADER`, `entitySubscription`/`channelSubscription`, `registry.channels` (`ChannelLog`) — consistent throughout.
- `render(url, live)` dev-graph fix is load-bearing (Task 11 note); do not skip it.
