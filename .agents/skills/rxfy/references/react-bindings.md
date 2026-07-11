# React Bindings (rxfy-react)

```tsx
// 1. Wrap the app once
<StoreProvider>
  <App />
</StoreProvider>

// 2. Fetch and normalize
const { data$, mutations, set, setRaw, reload } = useStateData({ state: myState, fetchFn, params });
// fetchFn: (params, signal: AbortSignal) => Promise<denormalized shape> — use signal to cancel
// data$ emits the query shape — array fields → id[], single → id string, plain (zod) fields → their value

// 3. Render async state
<Pending value$={data$} pending={<Spinner />} rejected={(w) => <Error err={w.error} />}>
  {({ todos }) => todos.map((id) => <TodoItem key={id} id={id} />)}
</Pending>

// 4. Read an entity by id — sync writable handle; the id must come from a fulfilled query
const store = useModelStore(TodoModel);
const [todo] = useAtom(store.get(id)); // the cell itself — stable identity, no useMemo needed
<li>{todo.title}</li>

// 5. Bind an IAtom (Lens / field handle)
const [value, setValue] = useAtom(atom$); // atom$ must be stable across renders
```

## Hook quick-reference

| Hook | Returns | Notes |
|------|---------|-------|
| `useStateData({ state, fetchFn, params })` | `StateHandle` | Re-fetches when `params` value changes; `data$` identity stays stable |
| `useStatePagedData({ model, key, params, fetchPage, getCursor, select })` | `PagedListHandle` | Infinite list — see **Pagination** in mutations-writes.md |
| `useModelStore(descriptor)` | `ModelStore<T>` | Same descriptor → same store in the registry; for pushing external data in, see **External writes** in mutations-writes.md |
| `useModelRegistry()` | `IModelRegistry` | The active registry — for `added$` subscriptions / manual store access |
| `useAtom(atom$)` | `[T, set]` | `store.get(id)` is already stable; memoize derived atoms (`Lens`, drafts) — new identity resets |
| `usePending(source$)` | `IWrapped<T>` | Low-level; prefer `<Pending>` for rendering |
| `useObservable(obs$, initial)` | `T` | Raw subscription to any observable |
