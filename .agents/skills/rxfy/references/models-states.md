# Models & States

Minimalistic, RxJS-backed library for typed, normalized, reactive state in React — built for consistency and granular reactivity at no extra cost. Entities live in shared `ModelStore`s keyed by id; each page declares its own state over those stores, where the query holds only ids and resolves entities from the stores. A single `store.set` — from a refetch, mutation, or websocket push — reactively updates every component showing that entity. States and stores are serializable, so SSR is first-class.

## Core Building Blocks

| API                                              | What it is                                                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IWrapped<T>` / `StatusEnum`                     | `IDLE \| PENDING \| FULFILLED \| REJECTED` discriminated union                                                                                        |
| `createModel({ schema, getKey, name })`          | Entity type + id extractor                                                                                                                            |
| `defineState({ key, params, model, mutations })` | Typed fetch descriptor; each `model` entry is `array(model)`, `single(model)`, or a bare zod schema                                                   |
| `array(model)` / `single(model)`                 | Declare a `model` field as a list of / one entity — used in `defineState({ model })`                                                                  |
| _bare zod schema_ as a `model` entry             | A **plain value field** (boolean/primitive/object) — passes through `data$` with its real value, never normalized into a store. Validated in dev only |
| `ModelStore<T>`                                  | `get(id)` (writable `IAtom`, throws if not loaded), `set`, `setMany`, `getValue(id)`, `valueEntries`, `added$`                                        |
| `IModelRegistry`                                 | Shared store registry — one per request (SSR) or app lifetime (client)                                                                                |

```ts
const Todo = createModel({ schema: todoSchema, getKey: (t) => t.id, name: "todos" });
const listState = defineState({
  key: "todos",
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(Todo) },
});
```

> `name` on `createModel` and `key` on `defineState` are required — they are the stable string identities SSR dehydration and live topics address entities by. See `ssr.md`.
