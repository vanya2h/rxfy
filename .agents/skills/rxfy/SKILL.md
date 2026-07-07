---
name: rxfy
description: Use when working with the rxfy or rxfy-react packages in a client-state setup — declaring models and states, subscribing to reactive data in React, handling async status (IDLE/PENDING/FULFILLED/REJECTED), composing nested state with Lens, binding atoms, calling mutations, paginating, or wiring SSR (dehydrate/hydrate, HydrationStream streaming, two-pass). Also use when encountering "entity is not loaded" errors or confusion between normalized ids and entity data.
license: MIT
metadata:
  author: vanya2h
  version: "2.0.0"
---

# rxfy

Minimalistic, RxJS-backed library for typed, normalized, reactive state in React. Entities live in shared `ModelStore`s keyed by id; each page declares its own state over those stores — the query holds only ids and resolves entities from the stores. A single `store.set` reactively updates every component showing that entity. States and stores are serializable, so SSR is first-class.

This skill covers the **store setup**: client state + SSR. (Real-time server push is a separate setup with its own skill, `rxfy-framework`.)

## The one rule that prevents most bugs

`data$` from `useStateData` emits the **query shape** — model fields hold **ids**, not entities. Read entities via `useModelStore(model).get(id)`.

## Reference modules

| Read | When working on |
|---|---|
| `references/models-states.md` | `createModel`, `defineState`, `array`/`single`, plain value fields |
| `references/react-bindings.md` | `useStateData`, `useModelStore`, `useAtom`, `<Pending>`, hook table |
| `references/mutations-writes.md` | mutations, `set` vs `setRaw`, pagination, external writes |
| `references/lens-atoms.md` | `createAtom`, `createLens`, `keyLens` nested state |
| `references/ssr.md` | dehydrate/hydrate, buffered/streaming/two-pass SSR, StoreProvider props |
| `references/common-mistakes.md` | debugging — check here first for known pitfalls |

## Minimal shape

```tsx
const Todo = createModel({ schema: todoSchema, getKey: (t) => t.id, name: "todos" });
const listState = defineState({ key: "todos", params: z.object({}), model: { todos: array(Todo) } });

const { data$ } = useStateData({ state: listState, fetchFn, params });
<Pending value$={data$}>{({ todos }) => todos.map((id) => <TodoItem key={id} id={id} />)}</Pending>
```
