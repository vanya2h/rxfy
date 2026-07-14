# Live Utilities: `modelTopic` + `createSubscriptionManager`

**Date:** 2026-06-15
**Status:** Approved

## Summary

Add two transport-agnostic utilities to the `rxfy` core package that reduce copy-paste boilerplate for live-update (WebSocket / SSE / tRPC) integrations. Only `modelTopic` is exported (no raw `topic()`); `Topic` type is exported for consumers typing their wire messages.

---

## Architecture

### New files

```
packages/rxfy/src/live/
  topic.ts               — Topic type, internal topic(), exported modelTopic()
  subscription-manager.ts — createSubscriptionManager()
  index.ts               — re-exports both modules
```

`packages/rxfy/src/index.ts` adds one line:

```ts
export * from "./live/index.js";
```

No new subpath entry point; these are part of the main `rxfy` barrel.

---

## API

### `Topic` type and `modelTopic`

```ts
// Topic — branded template literal so string literals and swapped-arg calls don't type-check
declare const brand: unique symbol;
export type Topic = `${string}:${string}` & { readonly [brand]: "Topic" };

// Internal only — not exported
const topic = (name: string, id: string): Topic => `${name}:${id}` as Topic;

// Exported — requires a named ModelDescriptor; throws if model.name is absent
export function modelTopic<T>(model: ModelDescriptor<T>, id: string): Topic {
  if (!model.name) {
    throw new Error(`rxfy: modelTopic requires a named model — pass { name: "..." } to createModel`);
  }
  return topic(model.name, id);
}
```

`modelTopic(TodoModel, id)` replaces `topic(TodoModel.name!, id)` throughout user code, eliminating the non-null assertion and making the arg order unambiguous.

### `createSubscriptionManager`

```ts
export type SubscriptionManager = ReturnType<typeof createSubscriptionManager>;

export function createSubscriptionManager(send: (topics: Topic[]) => void): {
  want(topic: Topic): void;
  reconnect(): void;
};
```

**Internals:**

- `desired: Set<Topic>` — grows monotonically; never shrinks (store-lifecycle == subscription-lifecycle)
- `active: Set<Topic>` — what the server currently knows
- `reconcile()` — sends `desired − active`, then sets `active = desired`; called inside `want` and `reconnect`
- `want(topic)` — no-op if already in `desired`; otherwise adds and reconciles
- `reconnect()` — clears `active` (server forgot us) then reconciles, replaying the full desired set

**Caller contract:** the `send` callback is invoked synchronously during `want`/`reconnect` only when there are new topics to send. The caller is responsible for the transport (WebSocket readyState guard, envelope format, etc.).

---

## Documentation

Update the live-updates-websockets guide:

- Replace the inline `topic.ts` snippet with an import of `modelTopic` and `Topic` from `rxfy`
- Replace the inline `liveClient.ts` snippet with an import of `createSubscriptionManager` from `rxfy`
- Update `useStoreSubscriptions.ts` snippet to use `modelTopic(…)` instead of `topic(name, key)`
- Add a brief note to `apps/docs/src/pages/core-concepts/model.mdx` under `createModel` pointing to the live-updates guide for live-update patterns

---

## Testing

Both utilities are pure functions with no I/O. Unit tests in `packages/rxfy/src/live/`:

- `topic.ts`: `modelTopic` returns `"name:id"` string; throws when model has no name
- `subscription-manager.ts`:
  - `want` calls `send` only with new topics (gap logic)
  - `want` is idempotent (second call same topic → no send)
  - `reconnect` replays the full desired set regardless of what was active
  - `send` is not called when gap is empty

---

## Out of scope

- React hooks (`useLiveEntities`, `useStoreSubscriptions`) — not added in this PR; remain user-land
- Server-side `Hub` — no rxfy dependency, stays in the guide as reference code
- `rxfy/live` subpath — not needed; zero import cost
