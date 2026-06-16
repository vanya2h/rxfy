---
"rxfy-react": minor
---

**Breaking:** `useStateData` now takes a single config object instead of positional arguments. Replace `useStateData(state, fetchFn, params, { defaultData })` with `useStateData({ state, fetchFn, params, defaultData })`. This matches the shape of `useStatePagedData` and makes the optional `defaultData` a flat field rather than a separate options argument.

Also exports the `UseStateDataConfig` and `Updater<T>` types. `Updater<T>` (`T | ((prev: T) => T)`) is the `useState`-style setter union used by `set` and `setRaw`.

Reworks the internals for a stabler `data$`:

- **`reload()` refetches in place.** It now flips the shared query atom to PENDING and refetches into it, instead of deleting the cache entry and rebuilding the handle. Every component subscribed to the same keyed state sees the refreshed result (previously only the caller did — others were stranded on stale data), and `data$` keeps a stable identity across a reload (a FULFILLED → reload no longer flashes a new subscription; it revalidates in place). A reload recovering from a REJECTED state still resubscribes, since an Rx error is terminal.
- **`data$` identity is stable** across re-renders, a changing `defaultData`, and an identity-unstable-but-value-equal `params` (the query is now keyed by the params _value_). `defaultData` changes never reset the stream — only the first load reads it.
- **`set` / `setRaw` abort any in-flight fetch** before committing FULFILLED, so an explicit write can't be clobbered by a late-arriving fetch result.

`useStatePagedData.reload()` resets its own pagination state to match the new in-place reload semantics.
