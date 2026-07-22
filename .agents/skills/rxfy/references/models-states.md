# Models & States

Minimalistic, RxJS-backed library for typed, normalized, reactive state in React — built for consistency and granular reactivity at no extra cost. Entities live in shared `ModelStore`s keyed by id; each page declares its own state over those stores, where the query holds only ids and resolves entities from the stores. A single `store.set` — from a refetch, mutation, or websocket push — reactively updates every component showing that entity. States and stores are serializable, so SSR is first-class.

## Core Building Blocks

| API                                                           | What it is                                                                                                                                                                                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IWrapped<T>` / `StatusEnum`                                  | `IDLE \| PENDING \| FULFILLED \| REJECTED` discriminated union                                                                                                                                                                            |
| `createModel({ schema, getKey, name })`                       | Entity type + id extractor                                                                                                                                                                                                                |
| `defineState({ key, params, model, mutations })`              | Typed fetch descriptor; each `model` entry is `array(model)`, `single(model)`, or a bare zod schema                                                                                                                                       |
| `array(model)` / `single(model)`                              | Declare a `model` field as a list of / one entity — used in `defineState({ model })`; chain `.with({ rel: true })` to join a relation for this fetch                                                                                      |
| `ref(model)` / `refArray(model)`                              | Declare a **relation field** inside a model schema (to-one / to-many); the referenced entity normalizes into its own store, the field holds its `StoreKey`                                                                                |
| `.with({ rel: true })`                                        | Per-state relation join on a `single`/`array` field (Prisma-`include` style — a nested map `{ rel: { sub: true } }` joins recursively). Joined → field present as `StoreKey`; not joined → field absent                                   |
| `createModel({ …, fk: { rel: "col" } })`                      | Type-safe FK-linkage map (keys = relation fields, values = schema columns) — records the FK a relation mirrors, so a live sync `patch` keeps it resolvable                                                                                |
| _bare zod schema_ as a `model` entry                          | A **plain value field** (boolean/primitive/object) — passes through `data$` with its real value, never normalized into a store. Validated in dev only                                                                                     |
| `ModelStore<T>`                                               | `get(StoreKey)` (writable `IAtom`, throws if not loaded), `set`, `setMany`, `getValue(id)`, `observe(id)`, `valueEntries`, `added$` — the key's brand flows through `get`: a joined-view key returns the joined view (relations required) |
| `StoreKey<T>` / `asKey(model, id)`                            | `get` accepts only a framework-minted `StoreKey`, not a raw string — query-shape ids already are one; brand a raw id (URL param) with `asKey`                                                                                             |
| `IModelRegistry`                                              | Shared store registry — one per request (SSR) or app lifetime (client); `descriptor(name)` looks up a registered model                                                                                                                    |
| `NormalizedOf`/`ShapeOf`/`InputOf`/`WritableOf`/`ParamsOf<S>` | Infer a state's shapes off a `defineState` value: query shape / denormalized output / `serve` input / writable / params. `ViewOf<StoreKey>` derefs a key to its entity view — `z.infer` for states                                        |

```ts
const Todo = createModel({ schema: todoSchema, getKey: (t) => t.id, name: "todos" });
const listState = defineState({
  key: "todos",
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(Todo) },
});
```

> `name` on `createModel` and `key` on `defineState` are required — they are the stable string identities SSR dehydration and live topics address entities by. See `ssr.md`.

## Relations & per-state joins

A model field can reference another model. Declare the relation **in the schema** with `ref`/`refArray`; declare whether a given fetch delivers it **joined** (per state, via `.with()`).

```ts
const Category = createModel({ schema: categorySchema, getKey: (c) => c.id, name: "category" });
const Post = createModel({
  schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(Category) }),
  getKey: (p) => p.id,
  name: "post",
  fk: { category: "categoryId" }, // type-safe: keys = relation fields, values = schema columns
});

const postPage = defineState({
  key: "post",
  params: z.object({ id: z.string() }),
  model: { post: single(Post).with({ category: true }) },
});
const postList = defineState({ key: "posts", params: z.object({}), model: { posts: array(Post) } });
```

- **Same model, one store.** The list stores refs only (`post.category` absent from its query-shape type); the detail joins the category into the _same_ Post/Category stores. No second model.
- **id-vs-entity holds.** `post.category` in `data$` is a `StoreKey` (an id), resolved via `useModelStore(Category).get(post.category)` — only when the state joined it (else the field isn't in the type).
- **View-typed reads (no `!`).** A joined query-shape id is branded with the view it was fetched as, so `get(ref)` returns an entity whose joined relations are **required** — read them straight, no `!` or fallback. Thread the branded id down to child components (don't re-widen to `string`/a bare id); name the ref type with `NormalizedOf<typeof state>["field"]` or `ViewOf<Ref>["rel"]`. Recurses: a nested join's ref carries its own joined relations.
- **`fk`** links `category` ↔ `categoryId` so a live sync `patch` (a flat row) keeps `category` resolvable; see `sync-*.md`.
- **`StoreKey` gate.** `ModelStore.get` rejects raw strings — query-shape ids are `StoreKey`s; brand a raw id with `asKey(model, id)`. For a maybe-unloaded read, use `useModelStoreValue(model, id)` (non-throwing) — see `react-bindings.md`.
