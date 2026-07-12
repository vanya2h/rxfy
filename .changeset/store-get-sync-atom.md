---
"rxfy": major
---

BREAKING: `ModelStore.get(key)` now returns a writable `IAtom<T>` (the former `entity(key)` handle) instead of a filtering `Observable<T>`, and `ModelStore.entity` is removed. Accessing a key that has never been `set` **throws** instead of returning an observable that waits silently — ids are expected to come from fulfilled states, which always normalize their entities into the store before handing out ids, so an unloaded access is a programming error surfaced early.

- `get(id)` reads synchronously (`.get()`), subscribes reactively (it is still an `Observable`), and writes back (`.set()` / `.modify()`), exactly like `entity(id)` did.
- `get(id)` returns the entity's cell itself — a stable identity across calls, with no per-call wrapper allocation. Store cells are only created on `set`, so a cell existing means its entity is loaded.
- `get()` results are no longer sync-marked — no `usePending`/`<Pending>` probe is involved; entity reads carry no async status at all.

Migration:

- `store.entity(id)` → `store.get(id)` (same semantics).
- `<Pending value$={store.get(id)}>{(x) => …}</Pending>` → `const [x] = useAtom(useMemo(() => store.get(id), [store, id]))` and render directly.
- `combineLatest({ a: storeA.get(ia), b: storeB.get(ib) })` → two `useAtom` reads.
- To probe for presence without throwing, use `store.getValue(id)`.
