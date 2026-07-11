---
"rxfy": minor
---

`IModelRegistry` is now generic over its registered models, accumulated as a name-keyed record: `createModelRegistry(postModel).add(commentModel)` types the registry as `IModelRegistry<{ post: typeof postModel; comment: typeof commentModel }>`. On a typed registry:

- `registry.store("post")` is a typed lookup returning `ModelStore<Post>` (new method; throws if the store was never materialized).
- `registry.model(descriptor)` only accepts registered descriptors at compile time.
- `registry.stashHydration(name, entities)` checks the name against registered models and the entities against that model's entity type.
- `registry.namedStores()` keys are the registered model names, and its values the union of the registered stores (use `store(name)` for a per-name type).

The closed set is a compile-time guard only — runtime behavior is unchanged, and `.add()` just materializes the store (idempotent) and returns the same registry. Bare `IModelRegistry` and no-arg `createModelRegistry()` remain the open registry: any descriptor is accepted lazily exactly as before, and typed registries are assignable wherever `IModelRegistry` is expected, so no consuming signatures change.

To support name-keyed typing, `createModel` now captures `name` as a literal type via a trailing `TName extends string = string` generic on `ModelDescriptor`/`CreateModelConfig` (non-breaking). Also exports `AnyModelDescriptor` and `ModelsShape`.
