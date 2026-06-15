# Live Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `modelTopic` and `createSubscriptionManager` to the `rxfy` core package and update the live-updates guide to import them.

**Architecture:** Two new focused files under `packages/rxfy/src/live/` — one for the `Topic` brand and `modelTopic`, one for the subscription reconciler — re-exported from the main barrel. The live-updates guide is updated to import these instead of defining them inline.

**Tech Stack:** TypeScript, Vitest, pnpm + Turbo monorepo. All tests run with `pnpm --filter rxfy test`. Single test files use `pnpm --filter rxfy exec vitest run src/live/<file>.test.ts`.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/rxfy/src/live/topic.ts` | `Topic` brand type, internal `topic()`, exported `modelTopic()` |
| Create | `packages/rxfy/src/live/topic.test.ts` | Unit tests for `modelTopic` |
| Create | `packages/rxfy/src/live/subscription-manager.ts` | `createSubscriptionManager` |
| Create | `packages/rxfy/src/live/subscription-manager.test.ts` | Unit tests for `createSubscriptionManager` |
| Create | `packages/rxfy/src/live/index.ts` | Re-exports both modules |
| Modify | `packages/rxfy/src/index.ts` | Add barrel export for `./live/index.js` |
| Modify | `apps/docs/src/pages/guides/live-updates-websockets.mdx` | Replace inline `topic.ts` and `liveClient.ts` snippets with rxfy imports; update `useStoreSubscriptions.ts` snippet |
| Modify | `apps/docs/src/pages/core-concepts/model.mdx` | Add live-update callout after the `createModel` section |

---

## Task 1: `Topic` type and `modelTopic`

**Files:**
- Create: `packages/rxfy/src/live/topic.ts`
- Create: `packages/rxfy/src/live/topic.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/rxfy/src/live/topic.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createModel } from "../model/model.js";
import { modelTopic, type Topic } from "./topic.js";

const TodoModel = createModel(z.object({ id: z.string() }), { getKey: (t) => t.id, name: "todo" });
const UnnamedModel = createModel(z.object({ id: z.string() }), { getKey: (t) => t.id });

describe("modelTopic", () => {
  it("returns name:id string", () => {
    expect(modelTopic(TodoModel, "u1")).toBe("todo:u1");
  });

  it("Topic type is a branded string", () => {
    const t: Topic = modelTopic(TodoModel, "u1");
    expect(typeof t).toBe("string");
  });

  it("throws when model has no name", () => {
    expect(() => modelTopic(UnnamedModel, "u1")).toThrow(
      "rxfy: modelTopic requires a named model",
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter rxfy exec vitest run src/live/topic.test.ts
```

Expected: FAIL — `Cannot find module './topic.js'`

- [ ] **Step 3: Implement `topic.ts`**

Create `packages/rxfy/src/live/topic.ts`:

```ts
import type { ModelDescriptor } from "../model/model.js";

declare const brand: unique symbol;
export type Topic = `${string}:${string}` & { readonly [brand]: "Topic" };

const topic = (name: string, id: string): Topic => `${name}:${id}` as Topic;

export function modelTopic<T>(model: ModelDescriptor<T>, id: string): Topic {
  if (!model.name) {
    throw new Error("rxfy: modelTopic requires a named model — pass { name: \"...\" } to createModel");
  }
  return topic(model.name, id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter rxfy exec vitest run src/live/topic.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/live/topic.ts packages/rxfy/src/live/topic.test.ts
git commit -m "feat(rxfy): add Topic type and modelTopic"
```

---

## Task 2: `createSubscriptionManager`

**Files:**
- Create: `packages/rxfy/src/live/subscription-manager.ts`
- Create: `packages/rxfy/src/live/subscription-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/rxfy/src/live/subscription-manager.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createModel } from "../model/model.js";
import { modelTopic } from "./topic.js";
import { createSubscriptionManager } from "./subscription-manager.js";

const TodoModel = createModel(z.object({ id: z.string() }), { getKey: (t) => t.id, name: "todo" });
const t1 = modelTopic(TodoModel, "1");
const t2 = modelTopic(TodoModel, "2");

describe("createSubscriptionManager", () => {
  it("calls send with the topic on first want", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith([t1]);
  });

  it("does not call send on a duplicate want", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    mgr.want(t1);
    expect(send).toHaveBeenCalledOnce();
  });

  it("sends only the gap on subsequent wants", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    mgr.want(t2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, [t1]);
    expect(send).toHaveBeenNthCalledWith(2, [t2]);
  });

  it("does not call send when gap is empty", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    send.mockClear();
    mgr.want(t1); // already active
    expect(send).not.toHaveBeenCalled();
  });

  it("reconnect replays full desired set", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    mgr.want(t2);
    send.mockClear();
    mgr.reconnect();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith([t1, t2]);
  });

  it("reconnect is a no-op when desired is empty", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.reconnect();
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter rxfy exec vitest run src/live/subscription-manager.test.ts
```

Expected: FAIL — `Cannot find module './subscription-manager.js'`

- [ ] **Step 3: Implement `subscription-manager.ts`**

Create `packages/rxfy/src/live/subscription-manager.ts`:

```ts
import type { Topic } from "./topic.js";

export type SubscriptionManager = ReturnType<typeof createSubscriptionManager>;

export function createSubscriptionManager(send: (topics: Topic[]) => void): {
  want(topic: Topic): void;
  reconnect(): void;
} {
  const desired = new Set<Topic>();
  let active = new Set<Topic>();

  const reconcile = () => {
    const gap = [...desired].filter((t) => !active.has(t));
    if (gap.length) send(gap);
    active = new Set(desired);
  };

  return {
    want(topic: Topic) {
      if (desired.has(topic)) return;
      desired.add(topic);
      reconcile();
    },
    reconnect() {
      active = new Set();
      reconcile();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter rxfy exec vitest run src/live/subscription-manager.test.ts
```

Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/live/subscription-manager.ts packages/rxfy/src/live/subscription-manager.test.ts
git commit -m "feat(rxfy): add createSubscriptionManager"
```

---

## Task 3: Wire into barrel export

**Files:**
- Create: `packages/rxfy/src/live/index.ts`
- Modify: `packages/rxfy/src/index.ts`

- [ ] **Step 1: Create the live index**

Create `packages/rxfy/src/live/index.ts`:

```ts
export * from "./topic.js";
export * from "./subscription-manager.js";
```

- [ ] **Step 2: Add to main barrel**

In `packages/rxfy/src/index.ts`, append after the last `export` line:

```ts
export * from "./live/index.js";
```

The file should end with:

```ts
export * from "./wrapped/wrapped.js";
export * from "./live/index.js";
```

- [ ] **Step 3: Run full test suite and type check**

```bash
pnpm --filter rxfy test && pnpm --filter rxfy check-types
```

Expected: all tests PASS, no type errors

- [ ] **Step 4: Commit**

```bash
git add packages/rxfy/src/live/index.ts packages/rxfy/src/index.ts
git commit -m "feat(rxfy): export modelTopic and createSubscriptionManager from main barrel"
```

---

## Task 4: Update live-updates guide

**Files:**
- Modify: `apps/docs/src/pages/guides/live-updates-websockets.mdx`

The guide currently defines `topic.ts` and `liveClient.ts` inline and imports them as local files. Replace both with rxfy imports.

- [ ] **Step 1: Replace the `shared/topic.ts` snippet**

Find this block (lines 34–42 in the guide):

```mdx
```ts
// shared/topic.ts (imported by client and server)
declare const brand: unique symbol;

// `name:id`, e.g. "todo:u1". The `& { brand }` makes it nominal, not just structural.
export type Topic = `${string}:${string}` & { readonly [brand]: "Topic" };

export const topic = (name: string, id: string): Topic => `${name}:${id}` as Topic;
```
```

Replace with:

```mdx
`Topic` and `modelTopic` are provided by `rxfy` — no local file needed:

```ts
import { type Topic, modelTopic } from "rxfy";
```
```

- [ ] **Step 2: Replace the `liveClient.ts` snippet**

Find the entire `### Subscription manager` section code block (the `createLiveClient` function, lines 225–256). Replace the code block with:

```mdx
`createSubscriptionManager` is provided by `rxfy`:

```ts
import { createSubscriptionManager, type SubscriptionManager } from "rxfy";
export type { SubscriptionManager };
```

Call it with a `send` function that writes to the socket:

```ts
// LiveProvider.tsx (excerpt)
const manager = createSubscriptionManager((topics) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "add", topics }));
  }
});

// On reconnect — replays the full desired set to the new connection
socket.addEventListener("open", () => manager.reconnect());
```
```

- [ ] **Step 3: Update `useStoreSubscriptions.ts` snippet**

`registry.added$` emits `{ name: string; key: string }`, not a `ModelDescriptor`, so `modelTopic` can't be used here. Replace the entire `useStoreSubscriptions` code block with the following (swaps the local `topic` import for the `Topic` type from `rxfy` and uses a template-literal cast):

```ts
// useStoreSubscriptions.ts
import { useEffect } from "react";
import { type Topic } from "rxfy";
import { useModelRegistry } from "rxfy-react";
import { useLiveClient } from "./LiveProvider";

export function useStoreSubscriptions() {
  const registry = useModelRegistry();
  const client = useLiveClient();

  useEffect(() => {
    const sub = registry.added$.subscribe(({ name, key }) =>
      client.want(`${name}:${key}` as Topic),
    );
    return () => sub.unsubscribe();
  }, [registry, client]);
}
```

- [ ] **Step 4: Verify the guide renders (manual check)**

Open `apps/docs/src/pages/guides/live-updates-websockets.mdx` and scan for any remaining references to `../shared/topic`, `createLiveClient`, or `liveClient.ts`. There should be none.

- [ ] **Step 5: Commit**

```bash
git add apps/docs/src/pages/guides/live-updates-websockets.mdx
git commit -m "docs: update live-updates guide to import modelTopic and createSubscriptionManager from rxfy"
```

---

## Task 5: Update core-concepts/model.mdx

**Files:**
- Modify: `apps/docs/src/pages/core-concepts/model.mdx`

- [ ] **Step 1: Add live-update callout after `createModel` signature block**

Find this paragraph (after the `createModel` signature code block):

```mdx
`name` is the model's stable string identity for SSR; only named models are included
in `dehydrate` output. Models without a name work normally but opt out of SSR
serialization (a dev warning fires if they hold data at dehydrate time).
```

Append immediately after it:

```mdx

> **Live updates:** Named models also integrate with `modelTopic` — see the
> [Live updates guide](/guides/live-updates-websockets) for how `name` connects a model
> to a WebSocket subscription.
```

- [ ] **Step 2: Commit**

```bash
git add apps/docs/src/pages/core-concepts/model.mdx
git commit -m "docs: add live-updates callout to createModel section"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the complete rxfy test suite**

```bash
pnpm --filter rxfy test
```

Expected: all tests PASS (includes the two new test files)

- [ ] **Step 2: Type-check the whole monorepo**

```bash
turbo check-types
```

Expected: no errors

- [ ] **Step 3: Build to verify exports compile**

```bash
pnpm --filter rxfy build
```

Expected: `dist/` produced with no errors; `modelTopic`, `Topic`, `createSubscriptionManager`, `SubscriptionManager` present in the type declarations.
