---
"rxfy": minor
---

Preserve branded id types end to end. `EntityKey<T>` extracts the key type from an entity's `id` field, so `data$`, `QueryShapeOf`, and `ModelStore.get` now carry branded types (e.g. `z.string().brand("PostId")`) instead of widening to `string`. `createModel` and `defineState` infer all three Zod generics (Output, Def, Input) — `z.ZodType<T>` placed `T` in the Input position too, which stripped brands during inference. `ModelDescriptor` gains an optional `TKey extends string` parameter inferred from `getKey`'s return type.
