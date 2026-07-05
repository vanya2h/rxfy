---
name: rxfy-framework
description: Use when working with the rxfy live-app stack — rxfy/rxfy-react store state (models, states, hooks, mutations, Lens, SSR) plus the real-time framework packages rxfy-server, rxfy-protocol, and rxfy-ws. Covers declaring models and states, reactive React data, dehydrate/hydrate SSR, Drizzle-bound resources, live.create/update/delete writes, patch/stale messages, WebSocket transports, createLiveClient, updatesAvailable$/applyUpdates, grants, and live hydration. Also use for "entity is not loaded" errors, id-vs-entity confusion, or live updates not reaching the client.
license: MIT
metadata:
  author: vanya2h
  version: "2.0.0"
---

# rxfy (framework mode)

The full rxfy live-app stack: typed, normalized, reactive client state **plus** server-pushed live updates. Entities live in shared `ModelStore`s keyed by id; server writes publish `patch`/`stale` messages over a WebSocket, the client writes them into the same stores, and every subscribed component re-renders — no polling, no refetch.

This skill is self-contained: it covers the store layer, SSR, and the real-time layer. (If the project only needs client state with no live push, the standalone `rxfy` skill is the better install — but never install both.)

## The two rules that prevent most bugs

1. `data$` from `useStateData` emits **ids**, not entities — read entities via `useModelStore(model).get(id)`.
2. `patch` updates an entity in place; `stale` never edits a list — it increments `updatesAvailable$` and the client refetches via `applyUpdates()`.

## Data flow

```
Drizzle table → defineResource → live.update → hub.publish(patch) → WebSocket → client store → subscribers re-render
live.create/delete + touch() → hub.publish(stale) → channel counter → "N new — refresh" badge → applyUpdates() → refetch
```

## Reference modules

**Store layer** (client state + SSR):

| Read | When working on |
|---|---|
| `references/models-states.md` | `createModel`, `defineState`, `array`/`single`, plain value fields |
| `references/react-bindings.md` | `useStateData`, `useModelStore`, `useAtom`, `<Pending>`, hook table |
| `references/mutations-writes.md` | mutations, `set` vs `setRaw`, pagination, external writes |
| `references/lens-atoms.md` | `createAtom`, `createLens`, `keyLens` nested state |
| `references/ssr.md` | dehydrate/hydrate, buffered/streaming/two-pass SSR, StoreProvider props |
| `references/common-mistakes.md` | debugging — check here first for known pitfalls |

**Real-time layer:**

| Read | When working on |
|---|---|
| `references/framework-server.md` | `defineResource`, `createServer`, `live.create/update/delete`, hub, topic keyer |
| `references/framework-protocol.md` | patch/stale wire format, codec, `PROTOCOL_VERSION` |
| `references/framework-transport.md` | `createWsServer`, `createWsClient`, socket adapters, reconnect |
| `references/live-client.md` | `createLiveClient`, `useLiveClient`, `updatesAvailable$`/`applyUpdates`, `liveClient` prop |
| `references/grants-hydration.md` | `live.grant`, `readSsrGrants`, SSR grant injection, state channels |
