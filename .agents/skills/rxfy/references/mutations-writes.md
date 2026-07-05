# Mutations, Writes & Pagination

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
const { mutations } = useStateData({ state: listState, fetchFn, params });
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

## External writes

Any out-of-band source can push entities straight into a store — every `store.get(id)` subscriber re-renders, no refetch:

```ts
const store = useModelStore(todoModel);
// rows: entity payloads from any out-of-band source (poll, event, import…)
store.setMany(rows.map((row) => todoModel.schema.parse(row)));

// React to entities entering ANY store:
const registry = useModelRegistry();
registry.added$.subscribe(({ name, key }) => {/* track what's on screen */});
```
