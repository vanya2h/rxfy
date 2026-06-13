---
"rxfy": minor
"rxfy-react": minor
---

Unify the data layer on the `Atom`/`Lens`/`Wrapped` primitives and remove the orphaned `Edge`/`Batcher`.

- **Query status now lives in the data layer.** The registry's query cache owns one `Atom<IWrapped<QueryShape>>` per key (`queries.getQuery(key)`), seeded `IDLE`. `useStateData` drives status on that shared Atom instead of a per-handle `BehaviorSubject`, so queries sharing a key dedup automatically (including the in-flight `PENDING` window).
- **`IWrapped` is the single async-status type.** The hand-rolled `QueryEntry` (query cache) and `IPendingStatus` (`usePending`) unions are gone. `usePending` now returns `IWrapped<T>`; the rejected variant no longer carries `onReload` — get reload from the `useStateData` handle's `reload()` (or `getAttachedReload(source$)`).
- **`ModelStore` cells are `Atom`s**, and a new `ModelStore.entity(key): IAtom<T>` plus the new `useAtom` hook enable app-wide two-way binding: a field `Lens` over an entity stays in sync across every subscriber of that entity.
- **SSR snapshots** now serialize as `SerializedWrapped` (`{ type: StatusEnum.FULFILLED | REJECTED, ... }`); only terminal states cross the wire.

BREAKING: removes `Edge`/`createEdge`/`IEdge` and `batcher` from `rxfy`, and `useEdge`/`<Edge>` from `rxfy-react` (use `usePending` + `Pending`). `usePending`'s return type and the SSR wire format changed.
