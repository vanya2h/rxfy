---
"rxfy": minor
"rxfy-react": minor
---

`createModel` now takes a single config object instead of two positional arguments.

The schema has been merged into the options object, matching the config-object shape used elsewhere
(e.g. `useStateData`). Update call sites from
`createModel(schema, { getKey, name })` to `createModel({ schema, getKey, name })`.
