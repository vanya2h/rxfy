---
name: rxfy-framework
description: Use when working with the rxfy live-app stack — rxfy/rxfy-react store state (models, states, hooks, mutations, Lens, SSR) plus the real-time framework packages rxfy-client, rxfy-server, rxfy-protocol, and rxfy-ws. Covers declaring models and states, reactive React data, dehydrate/hydrate SSR, Drizzle-bound resources, live.create/update/delete writes, patch/stale messages, WebSocket transports, createLiveClient, updatesAvailable$/applyUpdates, sessions (getSessionId, sessionHeaders, withSession), live.serve, and live.hydration. Also use for "entity is not loaded" errors, id-vs-entity confusion, or live updates not reaching the client.
license: MIT
metadata:
  author: vanya2h
  version: "2.0.0"
---

# rxfy (framework mode)

The full rxfy live-app stack: typed, normalized, reactive client state **plus** server-pushed live updates. Entities live in shared `ModelStore`s keyed by id; server writes publish `patch`/`stale` messages over a WebSocket, the client writes them into the same stores, and every subscribed component re-renders — no polling, no refetch.

There are no grants and no client subscriptions. The server tracks what each browser session was served — via `live.serve` on reads and `live.hydration` on SSR renders — and pushes updates for exactly that; the client's only outbound frame is `hello` (session-less when the server has yet to assign an id — the client never mints one).

This skill is self-contained: it covers the store layer, SSR, and the real-time layer. (If the project only needs client state with no live push, the standalone `rxfy` skill is the better install — but never install both.)

## The two rules that prevent most bugs

1. `data$` from `useStateData` emits **ids**, not entities — read entities via `useModelStore(model).get(id)`.
2. `patch` updates an entity in place; `stale` never edits a list — it increments `updatesAvailable$` and the client refetches via `applyUpdates()`.

## Data flow

```
Drizzle table → defineResource → live.update → hub.publish(patch) → WebSocket → client store → subscribers re-render
live.create/delete + touch() → hub.publish(stale) → channel counter → "N new — refresh" badge → applyUpdates() → refetch
live.serve(req, state, params, data) / live.hydration(registry) → hub.subscribe(session, ids) → session is now wired to receive the above
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
| `references/framework-server.md` | `defineResource`, `createServer`, `live.create/update/delete/serve/hydration`, hub |
| `references/framework-protocol.md` | patch/stale/session/hello wire format, codec, `PROTOCOL_VERSION` |
| `references/framework-transport.md` | `createWsServer`, `createWsClient`, socket adapters, reconnect |
| `references/live-client.md` | `createLiveClient` (from `rxfy-client`), `useLiveClient`, `updatesAvailable$`/`applyUpdates`, `liveClient` prop |
| `references/live-sessions.md` | session identity (`getSessionId`, `sessionHeaders`, `withSession`), API client wiring (`createApiClient`, `ApiProvider`, `useApi()` returning the client, the shared `RenderFn`), `live.serve`, `live.hydration`, hub TTL |
