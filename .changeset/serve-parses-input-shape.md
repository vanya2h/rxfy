---
"rxfy": minor
"rxfy-server": major
---

`live.serve(state, params, data)` now accepts the state's *input* shape and parses it through the field schemas instead of passing data through untouched. Raw DB rows — unbranded ids, extra columns like `createdAt` — go in with no casts; the returned payload has ids branded and unknown keys stripped. This changes `serve`'s behavior: the result is a new parsed object (not the same reference), and invalid data now throws.

To support this, rxfy threads the zod Input type through the descriptors: `ModelDescriptor`, `FieldDescriptor`, and `StateDescriptor` gain a trailing input type parameter (defaulted, non-breaking), `defineState` derives it via the new `InputShapeFromFields`, and the new `parseShape(fields, input)` helper performs the parse.
