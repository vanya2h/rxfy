# rxfy Client Live Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the client half of the live framework: add the `window` field to rxfy-core `defineState`; add `createLiveClient` (applies inbound `patch`es to stores via `registry.added$`/`namedStores`, counts `stale` signals per channel) to rxfy-react; thread it through `StoreProvider` (a `liveClient` prop + context) and `useStateData` (a derived invalidation channel → `updatesAvailable$` + `applyUpdates()`); and carry `grants` in the SSR hydration payload.

**Architecture:** `createLiveClient({ registry, transport, grants })` is a plain (non-React) browser-clean module in `rxfy-react`. It depends only on `rxfy` (registry) and the `ServerMessage` type from `rxfy-protocol` — NOT on drizzle/resources. It watches `registry.added$` (`{name,key}`) → looks up the entity's grant id → `transport.subscribe`; on inbound `patch` it does `registry.namedStores().get(name)?.set(id, data)`; on inbound `stale` it bumps a per-channel `BehaviorSubject<number>`. `useStateData` derives its channel via `invalidationChannel`-style logic (`state.key` + partition params, dropping `state.window`), asks the live client for that channel's counter (`updatesAvailable$`), and resets to 0 when a fetch fulfills; `applyUpdates()` = `reload()`. Grants ride inside each `DehydratedState` chunk.

**Tech Stack:** TypeScript, RxJS (`BehaviorSubject`), rxfy + rxfy-protocol + rxfy-react (workspace), React 18+, Vitest. The `ClientTransport` from `rxfy-ws/client` satisfies the structural `LiveTransport` interface — no hard `rxfy-ws` import.

This is Plan 6 (final) of the rxfy live framework. It implements design spec §5.2 (`window`), §5.8 (live client), §5.9 (`useStateData` counter), §5.10 (SSR grants). Branch `feat/rxfy-server-framework` (has the complete rxfy-protocol + rxfy-server + rxfy-ws).

> **Exact integration points** (verified against current source):
> - `defineState`/`StateDescriptor` in `packages/rxfy/src/state/state.ts` (descriptor return ~lines 126–131; `key`→`key`, `params`→`paramsSchema`, `model`→`fields`, `mutations`→`mutations`).
> - `useStateData` in `packages/rxfy-react/src/useStateData.ts`: registry via `useModelRegistry()` (line 75), `cacheKey`/`paramsKey` (lines 86–87), the `settle` fulfilled branch (line ~117) is the single fetch-success point, `reload` (lines 236–243), return (line 247).
> - `StoreProvider` in `packages/rxfy-react/src/StoreProvider.tsx`: props (lines 15–22), provider JSX (lines 40–44), `SsrContext` pattern (line 6), `hydrate(registry, chunk)` call sites (lines 47–50, 56–74).
> - `IModelRegistry.added$` emits `{ name: string; key: string }`; `registry.namedStores(): ReadonlyMap<string, ModelStore<any>>`; `ModelStore.set(key: string, val)`.
> - `DehydratedState` in `packages/rxfy/src/ssr/hydration.ts` (lines 4–7); `hydrationScript` pushes chunks to `window.__RXFY_SSR__` (array).
> - `useObservable(obs, initial)` for the counter UI.

---

## File Structure

| File | Change |
|---|---|
| `packages/rxfy/src/state/state.ts` | add `window?: readonly string[]` to descriptor + `defineState` |
| `packages/rxfy-react/package.json` | add `rxfy-protocol` dependency |
| `packages/rxfy-react/src/live/live-client.ts` | NEW — `createLiveClient`, `LiveClient`, `LiveTransport`, `Grants` |
| `packages/rxfy-react/src/live/live-client.test.ts` | NEW — live client tests |
| `packages/rxfy-react/src/live/channel.ts` | NEW — `stateChannel(state, params)` (window-aware) |
| `packages/rxfy-react/src/live/channel.test.ts` | NEW — channel derivation tests |
| `packages/rxfy-react/src/live-context.ts` | NEW — `LiveClientContext`, `useLiveClient` |
| `packages/rxfy-react/src/StoreProvider.tsx` | add `liveClient` prop + provider |
| `packages/rxfy-react/src/useStateData.ts` | add `updatesAvailable$` + `applyUpdates` |
| `packages/rxfy/src/ssr/hydration.ts` | add `grants` to `DehydratedState` + stash on hydrate |
| `packages/rxfy-react/src/index.tsx` | export the new live surface |

---

## Task 1: rxfy-core — add `window` to `defineState`

**Files:** `packages/rxfy/src/state/state.ts`.

- [ ] **Step 1: read the current file** to confirm the three `defineState` overloads + impl and the descriptor return object (around lines 55–131).

- [ ] **Step 2: add `window` to the `StateDescriptor` type.** In the `StateDescriptor` type, after the `key` field, add:
```ts
  /** Param names that slice *within* a dataset (page, cursor, sort) — excluded from the live invalidation channel. */
  readonly window?: readonly string[];
```

- [ ] **Step 3: add `window` to each `def` parameter shape.** In all three `defineState` signatures/overloads and the implementation, the `def` object literal type includes `key?`, `params`, `model`, `mutations?`. Add `window?: readonly string[];` to each.

- [ ] **Step 4: thread it into the returned descriptor.** In the implementation's `return { key: def.key, paramsSchema: def.params, fields: ..., mutations: ... }`, add `window: def.window,`.

- [ ] **Step 5: add a test.** In the existing state test file (find it: `packages/rxfy/src/state/state.test.ts` if present, else create `state.window.test.ts`), add:
```ts
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { defineState } from "./state.js";

describe("defineState window", () => {
  it("stores the window param names on the descriptor", () => {
    const s = defineState({
      key: "posts",
      params: z.object({ orgId: z.string(), page: z.number() }),
      window: ["page"],
      model: {},
    });
    expect(s.window).toEqual(["page"]);
  });

  it("defaults window to undefined", () => {
    const s = defineState({ key: "posts", params: z.object({ orgId: z.string() }), model: {} });
    expect(s.window).toBeUndefined();
  });
});
```
> If `model: {}` is rejected (empty FieldsMap), use a minimal valid field, e.g. `model: { open: z.boolean() }`, and adjust the assertions to keep them about `window` only.

- [ ] **Step 6: verify + commit.** `pnpm --filter rxfy test && pnpm --filter rxfy check-types && pnpm --filter rxfy lint` (lint:fix if needed).
```bash
git add packages/rxfy/src/state/state.ts packages/rxfy/src/state/*.test.ts
git commit -m "feat(rxfy): add window field to defineState for live invalidation channels"
```

---

## Task 2: rxfy-react — `createLiveClient` + channel derivation

**Files:** `packages/rxfy-react/package.json`, `src/live/live-client.ts`, `src/live/live-client.test.ts`, `src/live/channel.ts`, `src/live/channel.test.ts`.

- [ ] **Step 1: add `rxfy-protocol` dependency** to `packages/rxfy-react/package.json` — add a `"dependencies": { "rxfy-protocol": "workspace:*" }` block (before `devDependencies`); also add `"rxfy-protocol": "workspace:*"` to `devDependencies` if the repo pattern requires the workspace dep for tests (mirror how `rxfy` is listed). Run `pnpm install`.

- [ ] **Step 2: channel derivation `src/live/channel.ts`** (the client-side twin of rxfy-server's `invalidationChannel`, kept local to avoid a server dep). Write the failing test `src/live/channel.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { stateChannel } from "./channel.js";

describe("stateChannel", () => {
  it("drops window params so all windows of a partition share a channel", () => {
    const a = stateChannel({ key: "posts", window: ["page", "sort"] }, { orgId: "A", page: 3, sort: "top" });
    const b = stateChannel({ key: "posts", window: ["page", "sort"] }, { orgId: "A", page: 0, sort: "new" });
    expect(a).toBe("posts:orgId=A");
    expect(a).toBe(b);
  });

  it("returns the key alone when no partition params remain", () => {
    expect(stateChannel({ key: "posts", window: ["page"] }, { page: 1 })).toBe("posts");
  });

  it("returns undefined for a keyless state", () => {
    expect(stateChannel({ key: undefined, window: [] }, { orgId: "A" })).toBeUndefined();
  });

  it("is order-independent and encodes primitives without quotes", () => {
    expect(stateChannel({ key: "x" }, { b: 2, a: "1" })).toBe("x:a=1&b=2");
  });
});
```
Then implement `src/live/channel.ts`:
```ts
export type ChannelStateDescriptor = { key?: string; window?: readonly string[] };

const encode = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);

/** Window-independent invalidation channel for a state instance; `undefined` for keyless states. */
export function stateChannel(
  state: ChannelStateDescriptor,
  params: Record<string, unknown>,
): string | undefined {
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
> This mirrors rxfy-server's `invalidationChannel` (window/partition split, primitive encoding) but returns `undefined` for keyless states. Keep them behaviorally identical for shared topics — same encoding.

- [ ] **Step 3: live client `src/live/live-client.ts`** — write the failing test `src/live/live-client.test.ts`:
```ts
import { createModel, createModelRegistry } from "rxfy";
import { patch, stale, type ServerMessage } from "rxfy-protocol";
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
  const subscribed: string[] = [];
  const transport: LiveTransport = {
    subscribe: (ids) => subscribed.push(...ids),
    unsubscribe: () => {},
    onMessage: (h) => {
      handler = h;
    },
  };
  return { transport, subscribed, deliver: (m: ServerMessage) => handler?.(m) };
}

describe("createLiveClient", () => {
  it("applies an inbound patch to the matching store", () => {
    const registry = createModelRegistry();
    registry.model(postModel).setMany([{ id: "1", title: "old" }]);
    const { transport, deliver } = fakeTransport();
    createLiveClient({ registry, transport, grants: { entities: { "post:1": "eid" }, channels: {} } });
    deliver(patch("post", "1", { id: "1", title: "new" }));
    expect(registry.model(postModel).getValue("1")).toEqual({ id: "1", title: "new" });
  });

  it("subscribes to a held entity's grant id via added$", () => {
    const registry = createModelRegistry();
    registry.model(postModel).setMany([{ id: "1", title: "a" }]);
    const { transport, subscribed } = fakeTransport();
    createLiveClient({ registry, transport, grants: { entities: { "post:1": "eid" }, channels: {} } });
    expect(subscribed).toContain("eid");
  });

  it("counts stale signals per channel and resets", () => {
    const registry = createModelRegistry();
    const { transport, subscribed, deliver } = fakeTransport();
    const live = createLiveClient({ registry, transport, grants: { entities: {}, channels: { "posts:orgId=A": "cid" } } });
    const ch = live.channel("posts:orgId=A");
    expect(subscribed).toContain("cid");
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
    createLiveClient({ registry, transport, grants: { entities: {}, channels: {} } });
    expect(() => deliver(stale("unknown"))).not.toThrow();
  });

  it("subscribes pending channels when grants arrive later", () => {
    const registry = createModelRegistry();
    const { transport, subscribed } = fakeTransport();
    const live = createLiveClient({ registry, transport });
    live.channel("posts:orgId=A"); // no grant yet -> not subscribed
    expect(subscribed).toEqual([]);
    live.addGrants({ entities: {}, channels: { "posts:orgId=A": "cid" } });
    expect(subscribed).toContain("cid");
  });
});
```
Then implement `src/live/live-client.ts`:
```ts
import { BehaviorSubject, type Observable, type Subscription } from "rxjs";
import type { IModelRegistry } from "rxfy";
import type { ServerMessage } from "rxfy-protocol";

/** topic→id / channel→id lookup table the client uses to subscribe. */
export type Grants = {
  entities: Record<string, string>;
  channels: Record<string, string>;
};

/** Structural transport (satisfied by rxfy-ws/client's ClientTransport). */
export type LiveTransport = {
  subscribe: (ids: string[]) => void;
  unsubscribe: (ids: string[]) => void;
  onMessage: (handler: (message: ServerMessage) => void) => void;
};

export type ChannelCounter = {
  available$: Observable<number>;
  reset: () => void;
};

export type LiveClient = {
  channel: (channel: string) => ChannelCounter;
  addGrants: (grants: Grants) => void;
  stop: () => void;
};

export type LiveClientConfig = {
  registry: IModelRegistry;
  transport: LiveTransport;
  grants?: Grants;
};

export function createLiveClient({ registry, transport, grants }: LiveClientConfig): LiveClient {
  const entityIds: Record<string, string> = { ...(grants?.entities ?? {}) };
  const channelIds: Record<string, string> = { ...(grants?.channels ?? {}) };
  const counters = new Map<string, BehaviorSubject<number>>();
  const subscribedTopics = new Set<string>();
  const subscribedChannels = new Set<string>();

  const subscribeTopic = (topic: string): void => {
    const id = entityIds[topic];
    if (id && !subscribedTopics.has(topic)) {
      subscribedTopics.add(topic);
      transport.subscribe([id]);
    }
  };
  const subscribeChannel = (channel: string): void => {
    const id = channelIds[channel];
    if (id && !subscribedChannels.has(channel)) {
      subscribedChannels.add(channel);
      transport.subscribe([id]);
    }
  };

  transport.onMessage((message) => {
    if (message.kind === "patch") {
      registry.namedStores().get(message.name)?.set(message.id, message.data);
    } else {
      const counter = counters.get(message.channel);
      if (counter) counter.next(counter.value + 1);
    }
  });

  const addedSub: Subscription = registry.added$.subscribe(({ name, key }) => {
    subscribeTopic(`${name}:${key}`);
  });

  return {
    channel(channel) {
      let counter = counters.get(channel);
      if (!counter) {
        counter = new BehaviorSubject(0);
        counters.set(channel, counter);
      }
      subscribeChannel(channel);
      const subject = counter;
      return { available$: subject.asObservable(), reset: () => subject.next(0) };
    },
    addGrants(next) {
      Object.assign(entityIds, next.entities);
      Object.assign(channelIds, next.channels);
      for (const channel of counters.keys()) subscribeChannel(channel);
    },
    stop() {
      addedSub.unsubscribe();
    },
  };
}
```

- [ ] **Step 4: run both test files → pass; lint + check-types; commit.**
```bash
git add packages/rxfy-react/package.json pnpm-lock.yaml packages/rxfy-react/src/live
git commit -m "feat(rxfy-react): add createLiveClient and state channel derivation"
```

---

## Task 3: `LiveClientContext` + `StoreProvider` wiring

**Files:** `packages/rxfy-react/src/live-context.ts` (new), `packages/rxfy-react/src/StoreProvider.tsx`.

- [ ] **Step 1: `src/live-context.ts`** (mirror the `registry-context.ts` pattern, but nullable + no throw — live updates are optional):
```ts
import { createContext, useContext } from "react";
import type { LiveClient } from "./live/live-client.js";

export const LiveClientContext = createContext<LiveClient | null>(null);

/** The live client, or null when no `liveClient` was provided to StoreProvider. */
export function useLiveClient(): LiveClient | null {
  return useContext(LiveClientContext);
}
```

- [ ] **Step 2: `StoreProvider.tsx`** — add the prop + provider. Change the props type to add `liveClient?: LiveClient;`, destructure it, and wrap the children with `<LiveClientContext.Provider value={liveClient ?? null}>`:
```tsx
// add import:
import { LiveClientContext } from "./live-context.js";
import type { LiveClient } from "./live/live-client.js";

// props:
export type StoreProviderProps = PropsWithChildren<{
  ssr?: boolean;
  registry?: IModelRegistry;
  dehydratedState?: DehydratedState;
  liveClient?: LiveClient;
}>;

// signature: add `liveClient` to the destructure.
// JSX: nest the provider INSIDE SsrContext.Provider (or around it), e.g.:
//   <ModelRegistryContext.Provider value={registry}>
//     <SsrContext.Provider value={ssr}>
//       <LiveClientContext.Provider value={liveClient ?? null}>{children}</LiveClientContext.Provider>
//     </SsrContext.Provider>
//   </ModelRegistryContext.Provider>
```

- [ ] **Step 3: test** `packages/rxfy-react/src/live-context.test.tsx` — render a `StoreProvider` with a stub `liveClient` and assert a child `useLiveClient()` returns it; with no prop, returns null. Use `@testing-library/react` if already a dev dep (check `packages/rxfy-react/package.json`); otherwise test the context with a minimal `react-test-renderer` or a direct `useContext` harness. If no React test tooling exists in the package, SKIP the render test and instead unit-test that `LiveClientContext`'s default is `null` and `useLiveClient` reads context (export-shape test), and note the gap.

- [ ] **Step 4: verify + commit.**
```bash
git add packages/rxfy-react/src/live-context.ts packages/rxfy-react/src/StoreProvider.tsx packages/rxfy-react/src/live-context.test.tsx
git commit -m "feat(rxfy-react): add LiveClientContext and StoreProvider liveClient prop"
```

---

## Task 4: `useStateData` — `updatesAvailable$` + `applyUpdates`

**Files:** `packages/rxfy-react/src/useStateData.ts`.

- [ ] **Step 1: read the full current file** to confirm line refs (registry at 75, `paramsKey`/`cacheKey` at 86–87, `settle` fulfilled branch at ~117, `reload` at 236–243, return at 247, memo deps).

- [ ] **Step 2: extend `StateHandle`** with:
```ts
  readonly updatesAvailable$: Observable<number>;
  readonly applyUpdates: () => void;
```

- [ ] **Step 3: get the live client + derive the channel.** Near `const registry = useModelRegistry();` add `const liveClient = useLiveClient();` (import from `./live-context.js`). After `paramsKey`/`cacheKey`, compute the channel via the new `stateChannel(state, params)` (import from `./live/channel.js`).

- [ ] **Step 4: build the counter inside the memo.** Where the handle is assembled:
  - If `liveClient` and the channel are both present, `const counter = liveClient.channel(channel);` and use `counter.available$` as `updatesAvailable$`, and reset it in the `settle` FULFILLED branch (`counter.reset()` right after the successful `atom$.set(createFulfilled(...))`), and `applyUpdates = () => { counter.reset(); reload(); }`.
  - Otherwise (no live client or keyless state), `updatesAvailable$` is a constant `of(0)` (import `of` from rxjs) and `applyUpdates = reload`.
  - Add `liveClient` and `channel` to the memo dependency array.

- [ ] **Step 5: return them.** Change the return to `return { data$, set, setRaw, reload, mutations, updatesAvailable$, applyUpdates };`.

- [ ] **Step 6: test.** Add to the existing `useStateData` test (or a new `useStateData.live.test.tsx`): with a stub live client (whose `channel()` returns a controllable `available$`) provided via context, assert `handle.updatesAvailable$` reflects the channel counter and `applyUpdates()` calls reset + refetch. If React-hook testing tooling is absent, test the channel-derivation + reset wiring at the unit level and note the integration-test gap. Confirm the no-live-client path returns `of(0)` and `applyUpdates === reload`-equivalent.

- [ ] **Step 7: verify + commit.** `pnpm --filter rxfy-react test check-types lint`.
```bash
git add packages/rxfy-react/src/useStateData.ts packages/rxfy-react/src/*.test.tsx
git commit -m "feat(rxfy-react): integrate live updates counter into useStateData"
```

---

## Task 5: SSR — carry `grants` in the hydration payload

**Files:** `packages/rxfy/src/ssr/hydration.ts`, `packages/rxfy-react/src/StoreProvider.tsx` (or a small consumer).

- [ ] **Step 1: extend `DehydratedState`** in `hydration.ts`:
```ts
export type DehydratedState = {
  queries: Record<string, SerializedWrapped>;
  models: Record<string, Record<string, unknown>>;
  grants?: { entities: Record<string, string>; channels: Record<string, string> };
};
```
`dehydrate` currently returns `{ queries, models }`. Leave `dehydrate` producing those two; grants are attached by the caller (the server composes `hydrationScript({ ...dehydrate(registry), grants })` per design §5.10), so no change to `dehydrate` is required — but ensure the type allows the extra field (it now does).

- [ ] **Step 2: surface grants on the client.** The cleanest seam: since each `window.__RXFY_SSR__` chunk is a `DehydratedState`, expose the merged grants so the app can feed them to `createLiveClient`. Add a tiny helper in rxfy-react (e.g. `src/live/read-grants.ts`):
```ts
import type { Grants } from "./live-client.js";

/** Merge `grants` from all SSR hydration chunks present at load time. */
export function readSsrGrants(): Grants {
  const chunks = (globalThis as { __RXFY_SSR__?: Array<{ grants?: Partial<Grants> }> }).__RXFY_SSR__ ?? [];
  const entities: Record<string, string> = {};
  const channels: Record<string, string> = {};
  for (const chunk of chunks) {
    Object.assign(entities, chunk.grants?.entities);
    Object.assign(channels, chunk.grants?.channels);
  }
  return { entities, channels };
}
```
> The app wires it: `createLiveClient({ registry, transport, grants: readSsrGrants() })`, then `liveClient.addGrants(...)` on each client-side fetch. Streaming late chunks: the app can re-read or call `addGrants` as chunks arrive (the StoreProvider already patches `queue.push`; a follow-up can hook grants there — out of scope for v1).

- [ ] **Step 3: test** `readSsrGrants` by setting `globalThis.__RXFY_SSR__` to a couple of chunks and asserting the merge (last-writer-wins). Confirm `DehydratedState` with `grants` round-trips through `serializeForHtml`/parse (extend an existing hydration test).

- [ ] **Step 4: verify + commit.**
```bash
git add packages/rxfy/src/ssr/hydration.ts packages/rxfy-react/src/live/read-grants.ts packages/rxfy/src/ssr/*.test.ts packages/rxfy-react/src/live/*.test.ts
git commit -m "feat: carry live-update grants in the SSR hydration payload"
```

---

## Task 6: Exports, changesets, full verification

**Files:** `packages/rxfy-react/src/index.tsx`, changesets.

- [ ] **Step 1: export the live surface** from `packages/rxfy-react/src/index.tsx` (alphabetical among existing lines):
```ts
export { createLiveClient } from "./live/live-client.js";
export type { ChannelCounter, Grants, LiveClient, LiveTransport } from "./live/live-client.js";
export { stateChannel } from "./live/channel.js";
export { readSsrGrants } from "./live/read-grants.js";
export { LiveClientContext, useLiveClient } from "./live-context.js";
```
(rxfy core already exports `defineState`/`StateDescriptor`; the `window` field rides along automatically.)

- [ ] **Step 2: changesets.** Create `.changeset/rxfy-core-window.md`:
```md
---
"rxfy": minor
---

Add the optional `window` field to `defineState` (names the pagination/slice params excluded from a state's live invalidation channel), and carry live-update `grants` in the SSR hydration payload.
```
And `.changeset/rxfy-react-live.md`:
```md
---
"rxfy-react": minor
---

Add the client live layer: `createLiveClient` (applies inbound entity patches to stores and counts per-state "updates available" signals), `StoreProvider`'s `liveClient` prop + `useLiveClient`, and `useStateData`'s `updatesAvailable$` / `applyUpdates()`.
```

- [ ] **Step 3: full verification across affected packages.**
Run: `pnpm turbo build test lint check-types --filter=rxfy --filter=rxfy-react`
Expected: all green. Run `pnpm changeset status` (lists rxfy + rxfy-react minor).

- [ ] **Step 4: commit.**
```bash
git add packages/rxfy-react/src/index.tsx .changeset/rxfy-core-window.md .changeset/rxfy-react-live.md
git commit -m "feat(rxfy-react): export live client surface; add changesets"
```

---

## Final Verification

- [ ] `pnpm turbo build test lint check-types` (whole repo) → all packages green.

---

## Self-Review Notes

- **Spec coverage:** §5.2 (`window`), §5.8 (`createLiveClient`: `added$`→subscribe, `patch`→`namedStores().set`, `stale`→per-channel counter, `addGrants`), §5.9 (`useStateData` `updatesAvailable$`/`applyUpdates`, reset on fulfilled), §5.10 (`grants` in `DehydratedState` + `readSsrGrants`).
- **Decoupling:** `createLiveClient` imports only `rxfy` + the `ServerMessage` type from `rxfy-protocol` — NO drizzle/rxfy-server. The transport is structural (`rxfy-ws/client`'s `ClientTransport` satisfies it). The client never imports a DB driver.
- **Counter semantics:** purely client-side `BehaviorSubject<number>` per channel; `++` per `stale`, reset on fetch-fulfill; soft-hint (a boundary-window duplicate over-counts, a missed `stale` under-counts — reconciled by `applyUpdates`→refetch).
- **Risk areas (call out in review):** Task 4 edits the large `useStateData` memo — the counter Subject lifecycle must follow the memo deps; resetting in the `settle` fulfilled branch must not double-create counters. Task 3/4 React-hook tests depend on whether the package has React test tooling — if absent, the plan unit-tests the wiring and flags the integration-test gap rather than adding heavy tooling.
- **Out of scope (documented):** streaming-SSR late-chunk grant delivery (hook into the existing `queue.push` patch later); the deferred rxfy-protocol `@todo`s (#2 zod codec, #3 generic message names).
