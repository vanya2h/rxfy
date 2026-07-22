---
"rxfy": patch
---

Close three type-level loopholes where a conditional/mapped type collapsed to an over-permissive type in a degenerate case:

- **`.with()` include on a leaf relation** now accepts only `true`. Previously the recursion bottomed out at the empty object type `{}`, so `single(Post).with({ category: 1 })` (and other truthy junk) type-checked; `{ category: true }` and recursive joins are unchanged.
- **`createModel`'s `fk` map on a relation-less model** now rejects all keys. Previously `FkMap` collapsed to `{}` for a model with no relations, silently accepting junk like `fk: { bogus: "col" }`.
- **`EntityView` with a non-`true`/non-object include** now resolves the field to `never` instead of silently treating it as a flat join.
