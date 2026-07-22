# React Bindings (rxfy-react)

```tsx
// 1. Wrap the app once
<StoreProvider>
  <App />
</StoreProvider>;

// 2. Fetch and normalize
const { data$, mutations, set, setRaw, reload } = useStateData({ state: myState, fetchFn, params });
// fetchFn: (params, signal: AbortSignal) => Promise<denormalized shape> — use signal to cancel
// data$ emits the query shape — array fields → id[], single → id string, plain (zod) fields → their value

// 3. Render async state
<Pending value$={data$} pending={<Spinner />} rejected={(w) => <Error err={w.error} />}>
  {({ todos }) => todos.map((id) => <TodoItem key={id} id={id} />)}
</Pending>;

// 4. Read an entity by id — sync writable handle; the id must come from a fulfilled query
const store = useModelStore(TodoModel);
const [todo] = useAtom(store.get(id)); // the cell itself — stable identity, no useMemo needed
// `get` takes a StoreKey<T>, not a raw string. Ids from `data$`/query shapes already are one;
// brand a raw string (URL param, literal) with `asKey(Model, id)`. `get` throws if not loaded —
// for a maybe-unloaded read use `useModelStoreValue(Model, id)` → `T | undefined` (non-throwing).
// The key's brand flows through: an id from a JOINED state returns the joined view (relations
// required), so `get(post.author)` reads with no `!`. Thread branded ids down to children (don't
// re-widen to string); type the prop `NormalizedOf<typeof state>["field"]` / `ViewOf<Ref>["rel"]`.
<li>{todo.title}</li>;

// 5. Bind an IAtom (Lens / field handle)
const [value, setValue] = useAtom(atom$); // atom$ must be stable across renders
```

**Prefer `<Pending>` over the `usePending` hook** to render async state — it follows the
**late-unwrapping** principle: the value stays wrapped up to the render edge, and the surrounding
component never branches on status (`usePending` pulls that branch up into the body — an earlier
unwrap). It also revalidates smoothly: a reload refetches in place (`data$` keeps its identity and
skips the interim `PENDING`), so `<Pending>` holds the last fulfilled value across a live `stale`
refetch — no pending flash, no manual keep-previous. Reach for `usePending` only when you need the
`IWrapped<T>` value itself (a count, a derived label), not to gate a subtree.

## Hook quick-reference

| Hook                                                                      | Returns           | Notes                                                                                                                                            |
| ------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useStateData({ state, fetchFn, params })`                                | `StateHandle`     | Re-fetches when `params` value changes; `data$` identity stays stable                                                                            |
| `useStatePagedData({ model, key, params, fetchPage, getCursor, select })` | `PagedListHandle` | Infinite list — see **Pagination** in mutations-writes.md                                                                                        |
| `useModelStore(descriptor)`                                               | `ModelStore<T>`   | Same descriptor → same store in the registry; for pushing external data in, see **External writes** in mutations-writes.md                       |
| `useModelStoreValue(descriptor, id)`                                      | `T \| undefined`  | Non-throwing reactive read (`undefined` until loaded / when id is `null`) — for components that render whether or not a relation was joined      |
| `useModelRegistry()`                                                      | `IModelRegistry`  | The active registry — for `added$` subscriptions / manual store access                                                                           |
| `useAtom(atom$)`                                                          | `[T, set]`        | `store.get(id)` is already stable; memoize derived atoms (`Lens`, drafts) — new identity resets                                                  |
| `usePending(source$)`                                                     | `IWrapped<T>`     | Low-level; **prefer `<Pending>` for rendering** (late unwrapping + holds last value across reload). Use only when you need the raw `IWrapped<T>` |
| `useObservable(obs$, initial)`                                            | `T`               | Raw subscription to any observable                                                                                                               |
