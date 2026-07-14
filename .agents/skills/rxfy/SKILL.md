---
name: rxfy
description: Use when working with rxfy — the reactive, normalized state framework for React (packages rxfy, rxfy-react, rxfy-server, rxfy-ws, rxfy-client). Covers declaring models and states, subscribing to reactive data in React, async status (IDLE/PENDING/FULFILLED/REJECTED), Lens/atoms, mutations, pagination, SSR (dehydrate/hydrate, HydrationStream, two-pass), and the real-time sync layer (defineResource, sync.create/update/delete, patch/stale, WebSocket transports, signed $grant channels, createSyncClient). Also use for "entity is not loaded" errors, id-vs-entity confusion, sync updates not reaching the client, or when working inside a create-rxfy-app template.
license: MIT
metadata:
  author: vanya2h
  version: "3.0.0"
---

# rxfy

One framework, one store, progressive integration. Entities live in shared `ModelStore`s keyed by id; each page declares its own state over those stores — the query holds only **ids** and resolves entities from the stores. A single `store.set` reactively updates every component showing that entity. States and stores are serializable, so SSR is first-class; and once the sync layer is wired, server writes push `patch`/`stale` into the same stores and every subscribed component re-renders — no polling.

You adopt it at the depth your app needs: **Store → +SSR → +Sync**. These are levels of the same framework, not separate products. You either add them incrementally to an existing app, or start from a `create-rxfy-app` template already wired to a level.

## Invariant rules (prevent most bugs)

1. **id-vs-entity** — _always._ `data$` from `useStateData` emits the **query shape**: model fields hold **ids**, not entities. Read entities via `useModelStore(model).get(id)`.
2. **patch-vs-stale** — _once you're on the sync layer._ `patch` updates an entity **in place**; `stale` never edits a list — it increments `updatesAvailable$` and the client refetches via `applyUpdates()`.

## First, orient yourself

If you have **not** already established this project's entry mode (existing app vs scaffolded template) and integration level this session, read **`references/orientation.md`** first — it reads the setup variant that `rxfy-setup` recorded (in `CLAUDE.md`/memory) if present, otherwise detects from on-disk signals, and routes you. Once oriented, skip straight to the library below.

## Reference library — read the one matching your task

| Read                             | When you're…                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `references/orientation.md`      | first landing in a project — detect entry mode + integration level, get routed                  |
| `references/templates.md`        | working in a scaffolded app — what each template pre-wired, where to extend                     |
| `references/models-states.md`    | declaring models/states — `createModel`, `defineState`, `array`/`single`, plain value fields    |
| `references/react-bindings.md`   | reading data in React — `useStateData`, `useModelStore`, `useAtom`, `<Pending>`                 |
| `references/mutations-writes.md` | local writes — mutations, `set` vs `setRaw`, pagination, external writes                        |
| `references/lens-atoms.md`       | nested/derived state — `createAtom`, `createLens`, `keyLens`                                    |
| `references/ssr.md`              | server-render + hydrate — dehydrate/hydrate, buffered/streaming/two-pass, StoreProvider         |
| `references/sync-server.md`      | the sync server — `defineResource`, `sync.create/update/delete/serve/hydration`, hub            |
| `references/sync-client.md`      | the sync client — `createSyncClient`, `syncClient` prop, `updatesAvailable$`/`applyUpdates`     |
| `references/sync-grants.md`      | live grants — `$grant` custody, `subscribe` frames, renewal, `readSsrGrants`, API client wiring |
| `references/sync-protocol.md`    | the wire — patch/stale/subscribe format, codec, `PROTOCOL_VERSION`                              |
| `references/sync-transport.md`   | transports — `createWsServer`, `createWsClient`, socket adapters, reconnect                     |
| `references/common-mistakes.md`  | debugging — check here first for known pitfalls (store _and_ sync)                              |

## Minimal shape

```tsx
const Todo = createModel({ schema: todoSchema, getKey: (t) => t.id, name: "todo" });
const listState = defineState({ key: "todos", params: z.object({}), model: { todos: array(Todo) } });

const { data$ } = useStateData({ state: listState, fetchFn, params });
<Pending value$={data$}>{({ todos }) => todos.map((id) => <TodoItem key={id} id={id} />)}</Pending>;
```
