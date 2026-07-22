---
"rxfy": minor
---

Add inference helper types so app code can name a state's shapes without reaching into the phantom `_shape`/`_query`/`_shapeInput` carriers. From a `defineState` value: `ParamsOf<S>`, `ShapeOf<S>` (denormalized output), `NormalizedOf<S>` (normalized id shape `data$` emits), `WritableOf<S>`, and `InputOf<S>` (denormalized input a fetch/serve payload has before parsing). Plus `ViewOf<Key>` to deref a `StoreKey` to the entity view it was minted for. Mirrors `z.infer` for schemas — e.g. `NormalizedOf<typeof myState>["post"]` instead of `NonNullable<(typeof myState)["_query"]>["post"]`.
