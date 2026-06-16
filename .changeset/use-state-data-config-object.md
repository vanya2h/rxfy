---
"rxfy-react": major
---

**Breaking:** `useStateData` now takes a single config object instead of positional arguments. Replace `useStateData(state, fetchFn, params, { defaultData })` with `useStateData({ state, fetchFn, params, defaultData })`. This matches the shape of `useStatePagedData` and makes the optional `defaultData` a flat field rather than a separate options argument.
