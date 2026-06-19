---
"rxfy": minor
"rxfy-react": minor
---

Support plain (non-normalized) value fields in `defineState`.

`defineState({ model })` now accepts a bare zod schema as a field entry to declare a plain value
(boolean, primitive, or object). Such fields live in the query state and pass through `data$`
unchanged, distinct from `array()`/`single()` entity fields that normalize into model stores. Plain
values are validated against their schema in development and passed through in production.
