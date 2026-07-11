# Common Mistakes

## Store & React

| Mistake | Fix |
|---------|-----|
| Rendering `data$` values as entity data | `data$` holds ids — use `useModelStore` + `store.get(id)` for entities |
| `store.get(id)` throws "not loaded" | Only pass ids read from a fulfilled state; probe with `store.getValue(id)` when unsure |
| `setRaw` append throws "entity not loaded" | Pass the full entity objects to `setRaw`, not bare ids it hasn't stored — objects are normalized on write, no manual `normalizeResult` |
| Observable created inline in render | Memoize with `useMemo` — inline obs resets every render and never settles |
| `params` object rebuilt inline each render | `useMemo` it — `useStateData` compares by value, but a stable `{}` is what keeps a paged list one growing identity |
| Atom updates not triggering re-render | Consume via `useAtom` or `<Pending>` — plain `.get()` is synchronous only |
| Duplicate model name warning | Each `createModel` call must use a unique `name` across the registry |

## SSR

| Mistake | Fix |
|---------|-----|
| Client re-fetches everything despite SSR | Ensure `ssr` prop is `true` on both server and client `StoreProvider` |
| `hydrationScript` injected before HTML closes | Inject after piping all HTML — the script must load after the app markup |
| Multiple `StoreProvider` instances on client | Use one root `StoreProvider`; nested ones create separate registries |
| `useStateData` not suspending on server | `StoreProvider` missing the `ssr` prop |
| Query blank under buffered SSR after piping `data$` | Operators like `map` / `combineLatest` produce a fresh, non-sync-marked observable that `<Pending>` cannot probe synchronously, so it never renders during buffered SSR. Keep `<Pending>` on `data$` itself; entity reads are sync `store.get(id)` handles and need no probing. |
