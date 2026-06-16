---
name: rxfy
description: Use when working with the rxfy or rxfy-react packages — declaring models and states, subscribing to reactive data in React, handling async status (IDLE/PENDING/FULFILLED/REJECTED), composing nested state with Lens, binding atoms, or calling mutations. Also use when encountering "entity is not loaded" errors or confusion between normalized ids and entity data.
license: MIT
metadata:
  author: vanya2h
  version: "1.0.0"
---

# rxfy

RxJS-backed normalized state management. Entities live in shared `ModelStore`s keyed by id; queries store only ids. A single `store.set` — from a refetch, mutation, or websocket push — reactively updates every component showing that entity.

## Core Building Blocks

| API | What it is |
|-----|-----------|
| `createAtom(value)` | `BehaviorSubject`-backed `Observable<T>` with `.get()`, `.set()`, `.modify()` |
| `createLens(source$, lens)` | Derived `IAtom` over a slice of an `Atom`; `keyLens(key)` for object fields |
| `IWrapped<T>` / `StatusEnum` | `IDLE \| PENDING \| FULFILLED \| REJECTED` discriminated union |
| `createModel(schema, { getKey, name })` | Entity type + id extractor |
| `defineState({ key, params, model, mutations })` | Typed fetch descriptor |
| `array(model)` / `single(model)` | Declare a `model` field as a list of / one entity — used in `defineState({ model })` |
| `ModelStore<T>` | `get(id)`, `set`, `setMany`, `entity(id)`, `added$` |
| `IModelRegistry` | Shared store registry — one per request (SSR) or app lifetime (client) |

## React Bindings (rxfy-react)

```tsx
// 1. Wrap the app once
<StoreProvider>
  <App />
</StoreProvider>

// 2. Fetch and normalize
const { data$, mutations, set, setRaw, reload } = useStateData({ state: myState, fetchFn, params });
// fetchFn: (params, signal: AbortSignal) => Promise<denormalized shape> — use signal to cancel
// data$ emits QueryShapeOf<TShape> — arrays become id[], singles become an id string

// 3. Render async state
<Pending value$={data$} pending={<Spinner />} rejected={(w) => <Error err={w.error} />}>
  {({ todos }) => todos.map((id) => <TodoItem key={id} id={id} />)}
</Pending>

// 4. Subscribe to an entity by id
const store = useModelStore(TodoModel);
const todo$ = useMemo(() => store.get(id), [store, id]);
<Pending value$={todo$}>{(todo) => <li>{todo.title}</li>}</Pending>

// 5. Bind an IAtom (Lens / field handle)
const [value, setValue] = useAtom(atom$); // atom$ must be stable across renders
```

### Hook quick-reference

| Hook | Returns | Notes |
|------|---------|-------|
| `useStateData({ state, fetchFn, params })` | `StateHandle` | Re-fetches when `params` value changes; `data$` identity stays stable |
| `useStatePagedData({ model, key, params, fetchPage, getCursor, select })` | `PagedListHandle` | Infinite list — see **Pagination** below |
| `useModelStore(descriptor)` | `ModelStore<T>` | Same descriptor → same store in the registry |
| `useModelRegistry()` | `IModelRegistry` | The active registry — for `added$` subscriptions / manual store access |
| `useAtom(atom$)` | `[T, set]` | Memoize atom$ — new identity resets |
| `usePending(source$)` | `IWrapped<T>` | Low-level; prefer `<Pending>` for rendering |
| `useObservable(obs$, initial)` | `T` | Raw subscription to any observable |

## Mutations

Mutations receive full denormalized entities, return full entities — rxfy re-normalizes automatically:

```ts
const listState = defineState({
  key: "todos",
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(Todo) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
    toggle: (prev, id: string) => ({
      ...prev,
      todos: prev.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }),
  },
});

// In component:
mutations.addTodo({ id: crypto.randomUUID(), title: "Buy milk", done: false });
mutations.toggle(id);
```

## Writing back: `set` vs `setRaw`

`set` takes the **denormalized shape** (full entities), re-normalizes the whole thing, and writes it — O(N) for a list. `setRaw` writes the **id shape** directly and is the tool for append / prepend / reorder / dedup.

`setRaw` model-field slots accept ids, full entities, or a mix: object entities are written to their stores (schema-validated in dev) and replaced by their ids; strings pass through unchanged. So appending a fetched page needs **no** manual `normalizeResult` — and the "entity not loaded" footgun is gone:

```tsx
const { setRaw } = useStateData({ state: feedState, fetchFn, params });
// append a page — pass entities by object; setRaw normalizes them + appends their ids
const appendPage = (page: { items: FeedItem[] }) =>
  setRaw((prev) => ({ items: [...prev.items, ...page.items] }));
```

The updater's `prev` is the current **ids** (`QueryShapeOf`), so appends stay O(page size); passing entities costs only O(objects passed). `setRaw` is a no-op until the query is FULFILLED. Value type: `WritableQueryShapeOf<TShape>`.

## Pagination

`useStatePagedData` builds one growing id list backed by `useModelStore(model)` — page 0 fetches like `useStateData`, `loadMore()` appends the next page (it uses `setRaw` internally, so appends stay O(page size)):

```tsx
const { data$, loadMore, isLoading, hasMore, reload } = useStatePagedData({
  model: userModel,
  key: "users",                                  // SSR / cache key; omit to fetch per mount
  params,                                         // keep stable (useMemo) — one identity = one list
  fetchPage: ({ cursor, params, signal }) => fetchUsers(cursor, signal),
  getCursor: ({ ids, pageIndex }) => ids.length, // next cursor from current ids
  select: ({ page }) => page.items,              // entities this page contributes
  hasMore: ({ page }) => page.hasNext,           // omit for an infinite list
});
// data$ emits string[] — render each row via useModelStore(userModel).get(id)
```

## Live / external updates

Push entities straight into a store from a websocket or any out-of-band source — every `store.get(id)` subscriber re-renders, no refetch:

```ts
const store = useModelStore(todoModel);
socket.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data); // { name, entities }
  if (msg.name !== todoModel.name) return;
  store.setMany(msg.entities.map((row) => todoModel.schema.parse(row))); // validate, then normalize
});

// React to entities entering ANY store (e.g. to subscribe to live topics for what's on screen):
const registry = useModelRegistry();
registry.added$.subscribe(({ name, key }) => socket.send(`want:${name}:${key}`));
```

## Lens for Nested State

```ts
const form$ = createAtom({ name: "", age: 0 });
const name$ = createLens(form$, keyLens("name")); // IAtom<string>
// Writes propagate back to form$; reads are deep-equal deduped
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Rendering `data$` values as entity data | `data$` holds ids — use `useModelStore` + `store.get(id)` for entities |
| `store.entity(id)` throws at runtime | Guard with `<Pending>` or check `store.getValue(id)` first |
| `setRaw` append throws "entity not loaded" | Pass the full entity objects to `setRaw`, not bare ids it hasn't stored — objects are normalized on write, no manual `normalizeResult` |
| Observable created inline in render | Memoize with `useMemo` — inline obs resets every render and never settles |
| `params` object rebuilt inline each render | `useMemo` it — `useStateData` compares by value, but a stable `{}` is what keeps a paged list one growing identity |
| Atom updates not triggering re-render | Consume via `useAtom` or `<Pending>` — plain `.get()` is synchronous only |
| Duplicate model name warning | Each `createModel` call must use a unique `name` across the registry |

> For SSR setup (dehydrate/hydrate, Next.js App Router, buffered/two-pass modes) see the **rxfy-ssr** skill.
