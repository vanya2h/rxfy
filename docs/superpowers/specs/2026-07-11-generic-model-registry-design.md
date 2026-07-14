# Generic ModelRegistry — accumulated model types

Date: 2026-07-11
Status: approved

## Goal

Make `IModelRegistry` generic over its registered models so a registry built as
`createModelRegistry(postModel).add(commentModel)` accumulates a name-keyed record of
descriptor types, giving:

1. **Typed store lookup** — `registry.store("post")` returns `ModelStore<Post>`.
2. **Closed model set** — `registry.model(descriptor)` only accepts registered descriptors
   (compile-time only; runtime behavior is unchanged).
3. **Typed hydration** — `stashHydration(name, entities)` checks the name against registered
   models and the entities against that model's entity type.

All constraints are purely type-level. No runtime enforcement, warnings, or behavior changes.

## Design

### Name literal capture (`packages/rxfy/src/model/model.ts`)

`ModelDescriptor` and `CreateModelConfig` gain a trailing `TName extends string = string`
generic; the `name` field becomes `TName`. `createModel({ name: "post", ... })` infers the
literal `"post"`. Trailing position + default keeps existing usage compiling unchanged.

### Generic registry (`packages/rxfy/src/model/model-store.ts`)

```ts
type ModelsShape = Record<string, ModelDescriptor<any, any, any, any>>;
type EntityOf<D> = D extends ModelDescriptor<infer E, any, any, any> ? E : never;

export type IModelRegistry<TModels extends ModelsShape = any> = {
  add: <D extends ModelDescriptor<any, any, any, any>>(descriptor: D) => IModelRegistry<TModels & Record<D["name"], D>>;
  model: <D extends TModels[keyof TModels]>(descriptor: D) => ModelStore<EntityOf<D>>;
  store: <N extends keyof TModels & string>(name: N) => ModelStore<EntityOf<TModels[N]>>;
  stashHydration: <N extends keyof TModels & string>(name: N, entities: Record<string, EntityOf<TModels[N]>>) => void;
  namedStores: () => ReadonlyMap<
    keyof TModels & string,
    { [K in keyof TModels]: ModelStore<EntityOf<TModels[K]>> }[keyof TModels]
  >;
  // queries, channels, stores, added$ — unchanged
};
```

The default is `TModels = any` (not `ModelsShape`): with an `any` argument, bare
`IModelRegistry` is mutually assignable with every typed instantiation, so it stays the open
registry — `model()` accepts any descriptor and infers its entity type exactly as today — and
typed registries flow into every existing `IModelRegistry`-typed signature unchanged. A
`ModelsShape` default would instead close `store`/`stashHydration` over `string` names, whose
parameter contravariance blocks that assignability.

### Construction

```ts
export function createModelRegistry(): IModelRegistry; // open — back-compat
export function createModelRegistry<D extends ModelDescriptor<any, any, any, any>>(
  seed: D,
): IModelRegistry<Record<D["name"], D>>;
```

Typed accumulation starts from the seed argument: `createModelRegistry(post).add(comment)`.
Starting a closed record from an empty `{}` would make no-arg `registry.model(x)` reject
everything, so the no-arg form stays open (its `.add` intersects into the open shape — a
type-level no-op).

Runtime: `.add()` delegates to `model(descriptor)` (materializes the store, idempotent by
`_key`) and returns the same registry object. `store(name)` reads `namedStores().get(name)`.

### Internals ripple

None. Because the default is `any`, bare `IModelRegistry` already accepts typed registries;
no framework-internal signature changes. `AnyModelDescriptor` and `ModelsShape` are exported.

## Testing

- `expectTypeOf`/`@ts-expect-error` type tests in `model-store.test.ts`: closed `model()`
  rejects unregistered descriptors; `store("post")` returns `ModelStore<Post>`;
  `stashHydration` checks names and entity shapes; the no-arg registry stays open;
  `createModel` preserves the name literal.
- Runtime tests: `.add()` returns the same registry with the store materialized; `store()`
  resolves the same store as `model()`; existing suite stays green.

## Release

- `rxfy`: minor (new `add`/`store` API, new generics, `AnyModelDescriptor`/`ModelsShape` exports).
- No changes to `rxfy-react`, `rxfy-client`, `rxfy-server`.

Docs updates (`apps/docs`) are a follow-up, out of scope here.
