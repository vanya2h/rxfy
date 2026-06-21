# Plain state fields & local sync state — design

**Date:** 2026-06-18
**Packages:** `rxfy`, `rxfy-react`
**Status:** Approved (design), pending implementation plan

## Problem

`defineState`'s `model` map only accepts entity field descriptors — `array(Model)` /
`single(Model)`. Every field is assumed to be a normalized entity, and the query shape that
`data$` emits (`QueryShapeOf<TShape>`) blindly maps each field to an id or `id[]`. There is no way
to declare a field that is just a plain value — a boolean, a primitive, or an arbitrary object —
that should live in the query state and pass through untouched.

The query-shape type cannot distinguish a plain object from an entity, because it is derived purely
from the denormalized shape (`TShape`), and an entity is structurally just an object with an `id`.

Two capabilities are missing:

1. **Plain (non-normalized) value fields** — booleans, primitives, and plain objects defined by a
   zod schema, distinct from entities that normalize into model stores.
2. **Local / synchronous state** — when there is no server fetch, you must still pass a `fetchFn`.
   There is no first-class way to declare pure local state seeded from an object.

## Decisions

- **No wrapper for plain fields.** A plain field is declared by passing a **bare zod schema** in
  the `model` map, alongside `array()`/`single()`. "Not an `array()`/`single()` descriptor" means
  "plain value". The two are structurally disjoint (a descriptor carries `kind`+`model`; a zod
  schema carries `parse`/`safeParse`), so the distinction is unambiguous at the type level and at
  runtime — even when a plain value happens to contain an `id`.
- **Plain fields live in the query atom's value**, not in any model store. In `data$`, an entity
  field appears as ids; a plain field appears as its literal value.
- **Validation: dev only.** Plain values are `schema.parse()`d in non-production wherever they are
  ingested (fetch result, `set`, `setRaw`, mutation write-back), and passed through untouched in
  production. This mirrors the existing dev-only entity check in `setRaw`'s `toEntityId`.
- **Local state config is a discriminated union.** A `fetchFn`-based config and an `initial`-based
  config are mutually exclusive at the type level.
- **`reload()` in local mode resets to `initial`.**

## Part A — Plain value fields

### Public API

```ts
const dashboardState = defineState({
  key: "dashboard",
  params: z.object({ id: z.string() }),
  model: {
    todos: array(Todo),                                          // normalized → id[]
    owner: single(User),                                         // normalized → id
    isOpen: z.boolean(),                                          // plain → boolean
    filters: z.object({ q: z.string(), tab: z.enum(["a", "b"]) }), // plain → { q, tab }
  },
  mutations: {
    setOpen: (prev, open: boolean) => ({ ...prev, isOpen: open }),
  },
});
```

`data$` for this state emits:

```ts
{
  todos: string[];          // entity ids
  owner: string;            // entity id
  isOpen: boolean;          // plain value, passed through
  filters: { q: string; tab: "a" | "b" };
}
```

### Type changes (`packages/rxfy/src/state/state.ts`, `model/model.ts`)

- `FieldsMap` becomes `Record<string, FieldDescriptor<any> | z.ZodType<any, any>>`.
- `ShapeFromFields<T>` (denormalized shape): descriptor → its `_shape`; zod → `z.infer`.

  ```ts
  export type ShapeFromFields<T extends FieldsMap> = {
    [K in keyof T]: T[K] extends FieldDescriptor<infer S> ? S
      : T[K] extends z.ZodType<infer O, any> ? O
      : never;
  };
  ```

- **New** `QueryShapeFromFields<T>` — what `data$` emits:

  ```ts
  export type QueryShapeFromFields<T extends FieldsMap> = {
    [K in keyof T]: T[K] extends FieldDescriptor<infer S>
      ? (S extends readonly (infer Item)[] ? EntityKey<Item>[] : EntityKey<S>)
      : T[K] extends z.ZodType<infer O, any> ? O
      : never;
  };
  ```

- **New** `WritableQueryShapeFromFields<T>` — what `setRaw` accepts: entity slots accept
  `id | entity` (array: a mix); zod slots → plain value.
- The existing shape-driven `QueryShapeOf<TShape>` / `WritableQueryShapeOf<TShape>` are **kept** —
  they remain correct for entity-only shapes and serve as the backward-compatible **defaults**.
- `StateDescriptor` gains two **defaulted** generics so existing references keep compiling:

  ```ts
  export type StateDescriptor<
    TParams,
    TShape,
    TMutations extends MutationDefs<TShape> = Record<never, never>,
    TQuery = QueryShapeOf<TShape>,
    TWritable = WritableQueryShapeOf<TShape>,
  > = { /* …, fields, mutations */ };
  ```

  `defineState` fills `TQuery`/`TWritable` with the precise fields-driven types:

  ```ts
  StateDescriptor<
    TParams,
    ShapeFromFields<TFields>,
    TMutations,
    QueryShapeFromFields<TFields>,
    WritableQueryShapeFromFields<TFields>
  >
  ```

- New runtime helper `isFieldDescriptor(x): x is FieldDescriptor<any>` in `model.ts`
  (`x.kind === "array" || x.kind === "single"`), exported for use by `normalize.ts`.

### Runtime changes (`packages/rxfy/src/state/normalize.ts`)

Each of the three functions branches per field entry on `isFieldDescriptor`:

- `normalizeResult` — descriptor → existing entity logic; plain → `ids[name] = devParse(schema, value)`
  (dev: `schema.parse(value)`; prod: `value`).
- `denormalizeValue` — descriptor → read from store; plain → copy the value straight from the id
  shape (`value[name] = ids[name]`; no store).
- `normalizeWritable` — descriptor → existing `toEntityId`; plain → `devParse(schema, value)`.

A shared `devParse(schema, value)` helper does the dev-only `parse`, prod pass-through.

### `useStateData` threading (`packages/rxfy-react/src/useStateData.ts`)

`StateHandle` and `useStateData` pick up `TQuery`/`TWritable` from the descriptor (with the same
defaults), replacing internal `QueryShapeOf<TShape>` → `TQuery` and `WritableQueryShapeOf<TShape>`
→ `TWritable`. No control-flow change for entity fields.

### SSR

Plain values live in the query atom's FULFILLED value, which the `QueryCache` already
dehydrates/hydrates. No model store is involved. Limitation: like entities, plain values must be
JSON-serializable for SSR (zod can describe `Date`/`Map`, which the snapshot will not round-trip) —
documented, not enforced.

## Part B — Local / synchronous state

### Background

Passing `defaultData` today already seeds the atom to FULFILLED and **suppresses the auto-fetch**
(`useStateData.ts` lines 104–106 make `settled = true`, skipping both the IDLE fetch branch and the
SSR suspense branch); `fetchFn` then runs only on an explicit `reload()`. Local state mostly means
letting you **omit `fetchFn` entirely**.

### Public API

```ts
// remote (today) — unchanged
const { data$, set, mutations, reload } = useStateData({ state, fetchFn, params, defaultData });

// local sync — no fetchFn, no params, no PENDING
const { data$, set, mutations, reload } = useStateData({
  state: counterState,
  initial: { count: 0, todos: [], isOpen: false }, // denormalized shape
});
```

### Config type — discriminated union (`useStateData.ts`)

```ts
type RemoteStateConfig<TParams, TShape, TMutations> = {
  state: StateDescriptor<TParams, TShape, TMutations, /* … */>;
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>;
  params: TParams;
  defaultData?: TShape;
  initial?: never;
};

type LocalStateConfig<TParams, TShape, TMutations> = {
  state: StateDescriptor<TParams, TShape, TMutations, /* … */>;
  initial: TShape;
  fetchFn?: never;
  params?: never;
  defaultData?: never;
};

export type UseStateDataConfig<TParams, TShape, TMutations> =
  | RemoteStateConfig<TParams, TShape, TMutations>
  | LocalStateConfig<TParams, TShape, TMutations>;
```

The `?: never` members make the two modes mutually exclusive and give clear errors when mixed.

### Local-mode behavior

- `data$` starts **FULFILLED synchronously** with `normalizeResult(registry, fields, initial)` —
  entity fields normalize into their stores, plain fields pass through. It is `markSync`, so there
  is no PENDING flash and it is SSR-safe (no suspense).
- `set` / `setRaw` / `mutations` work identically (they already require FULFILLED).
- A `key` still shares the atom across components via the registry — a keyed local state is
  effectively a shared global slice, seeded once (only when the shared atom is still IDLE).
- `reload()` **resets to `initial`**: `writeThrough(normalizeResult(registry, fields, initial))`.
  Nothing is in flight, so no abort/epoch handling is needed.
- `params` is absent; `cacheKey`/`paramsKey` use `stableStringify(undefined)`.

### Implementation note

In `useStateData`, derive `isLocal = "initial" in config` (i.e. `fetchFn` absent). When local:
seed FULFILLED from `initial` when the atom is IDLE, build a settled `markSync` `data$`, and skip
the entire fetch-on-subscribe / `share()` / SSR-suspense machinery. `reload` becomes the reset
described above. The existing closure-capture and memo-deps discipline is preserved
(`initial` captured like `defaultData`; `data$` identity stays stable).

## Out of scope / YAGNI

- No deep-equality dedup specific to plain fields beyond what the atom already provides.
- No per-field SSR opt-out for plain values.
- No automatic migration of existing entity-only states — they are unaffected (defaults preserve
  their types and behavior).

## Affected files

- `packages/rxfy/src/model/model.ts` — `isFieldDescriptor`.
- `packages/rxfy/src/state/state.ts` — `FieldsMap`, `ShapeFromFields`, new
  `QueryShapeFromFields` / `WritableQueryShapeFromFields`, `StateDescriptor` generics,
  `defineState` return types.
- `packages/rxfy/src/state/normalize.ts` — per-field branching, `devParse` helper.
- `packages/rxfy-react/src/useStateData.ts` — config discriminated union, local mode,
  `TQuery`/`TWritable` threading.
- Tests: `state.test.ts`, `normalize.test.ts`, `useStateData.test.tsx` (+ a local-mode test file).
- Changeset: `minor` (new public capability; backward compatible).
