# Plain State Fields & Local Sync State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `defineState`'s `model` map accept bare zod schemas as plain (non-normalized) value fields, and let `useStateData` run as pure local sync state seeded from an `initial` object instead of a `fetchFn`.

**Architecture:** A field entry is either an `array()`/`single()` entity descriptor (normalizes into a model store) or a bare zod schema (a plain value that lives in the query atom and passes through). The two are structurally disjoint, so a single `isFieldDescriptor` guard branches both the type-level mapped types and the runtime normalize/denormalize loops. The query/writable shapes become fields-driven types carried on `StateDescriptor` via phantom generics (defaulted to the old shape-driven types for backward compatibility). `useStateData`'s config becomes a discriminated union: remote (`fetchFn`+`params`) or local (`initial`), where local seeds FULFILLED synchronously and `reload()` resets to `initial`.

**Tech Stack:** TypeScript, RxJS, zod, Vitest 3, @testing-library/react, tsup, Turbo, pnpm.

---

## File Structure

- `packages/rxfy/src/model/model.ts` — add `isFieldDescriptor` runtime guard.
- `packages/rxfy/src/state/state.ts` — widen `FieldsMap`; extend `ShapeFromFields`; add `QueryShapeFromFields` / `WritableQueryShapeFromFields`; add phantom generics to `StateDescriptor`; wire `defineState` return types.
- `packages/rxfy/src/state/normalize.ts` — branch each loop on `isFieldDescriptor`; add a `devParse` helper for dev-only validation of plain values.
- `packages/rxfy-react/src/useStateData.ts` — discriminated config union; local mode; thread `TQuery`/`TWritable` through `useStateData` and `StateHandle`.
- Tests: `model.test.ts`, `state.test.ts`, `normalize.test.ts`, `useStateData.test.tsx`, new `useStateData.local.test.tsx`.
- `.changeset/<name>.md` — `minor` for both packages.

Run all package tests from repo root with:

- `pnpm --filter rxfy test`
- `pnpm --filter rxfy-react test`

Type-check with `pnpm --filter rxfy check-types` / `pnpm --filter rxfy-react check-types`.

---

## Task 1: `isFieldDescriptor` runtime guard

**Files:**

- Modify: `packages/rxfy/src/model/model.ts`
- Test: `packages/rxfy/src/model/model.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/rxfy/src/model/model.test.ts` (ensure `array`, `single`, `createModel`, `isFieldDescriptor` are imported from `./model.js`, and `z` from `zod`):

```ts
describe("isFieldDescriptor", () => {
  const m = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id, name: "if-test" });

  it("returns true for array and single descriptors", () => {
    expect(isFieldDescriptor(array(m))).toBe(true);
    expect(isFieldDescriptor(single(m))).toBe(true);
  });

  it("returns false for a zod schema and plain values", () => {
    expect(isFieldDescriptor(z.boolean())).toBe(false);
    expect(isFieldDescriptor(z.object({ a: z.string() }))).toBe(false);
    expect(isFieldDescriptor(null)).toBe(false);
    expect(isFieldDescriptor(42)).toBe(false);
    expect(isFieldDescriptor({ kind: "other" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test -- model.test.ts`
Expected: FAIL — `isFieldDescriptor is not a function` (import error).

- [ ] **Step 3: Add the guard**

In `packages/rxfy/src/model/model.ts`, after the `single` function, add:

```ts
/** True when a field entry is an entity descriptor (`array`/`single`) rather than a bare zod schema. */
export function isFieldDescriptor(x: unknown): x is FieldDescriptor<any> {
  return (
    typeof x === "object" &&
    x !== null &&
    ((x as { kind?: unknown }).kind === "array" || (x as { kind?: unknown }).kind === "single")
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test -- model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model.ts packages/rxfy/src/model/model.test.ts
git commit -m "feat(rxfy): add isFieldDescriptor guard"
```

---

## Task 2: Fields-driven types in `state.ts`

**Files:**

- Modify: `packages/rxfy/src/state/state.ts`
- Test: `packages/rxfy/src/state/state.test.ts`

- [ ] **Step 1: Write failing type-level + runtime tests**

Append to `packages/rxfy/src/state/state.test.ts`. Add to the top imports: change the model import to `import { array, createModel, single } from "../model/model.js";` (already present) and the state import to `import { defineState, type QueryShapeFromFields, type QueryShapeOf, type WritableQueryShapeFromFields } from "./state.js";`. Then append:

```ts
describe("plain value fields", () => {
  const post = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id, name: "p2-post" });
  const fields = {
    posts: array(post),
    isOpen: z.boolean(),
    filters: z.object({ q: z.string() }),
  };

  it("stores a zod schema field entry verbatim", () => {
    const state = defineState({ params: z.object({}), model: fields });
    expect(state.fields.isOpen).toBe(fields.isOpen);
    expect(state.fields.filters).toBe(fields.filters);
  });

  it("maps query shape: entities -> ids, plain -> passthrough (type-level)", () => {
    expectTypeOf<QueryShapeFromFields<typeof fields>>().toEqualTypeOf<{
      posts: string[];
      isOpen: boolean;
      filters: { q: string };
    }>();
  });

  it("maps writable shape: entities -> id|entity, plain -> passthrough (type-level)", () => {
    expectTypeOf<WritableQueryShapeFromFields<typeof fields>>().toEqualTypeOf<{
      posts: (string | { id: string })[];
      isOpen: boolean;
      filters: { q: string };
    }>();
  });

  it("infers data$ shape on the descriptor (type-level)", () => {
    const state = defineState({ params: z.object({}), model: fields });
    type Query = NonNullable<(typeof state)["_query"]>;
    expectTypeOf<Query>().toEqualTypeOf<{ posts: string[]; isOpen: boolean; filters: { q: string } }>();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter rxfy check-types`
Expected: FAIL — `QueryShapeFromFields`, `WritableQueryShapeFromFields`, and `_query` do not exist.

- [ ] **Step 3: Rewrite `state.ts` types**

Replace the top of `packages/rxfy/src/state/state.ts` (the imports through `WritableQueryShapeOf`) with:

```ts
import type { z } from "zod";
import type { EntityKey, FieldDescriptor } from "../model/model.js";

/** A field entry: an entity descriptor (`array`/`single`) or a bare zod schema for a plain value. */
export type FieldEntry = FieldDescriptor<any> | z.ZodType<any, any>;

export type FieldsMap = Record<string, FieldEntry>;

/** The denormalized shape: entity descriptors contribute their `_shape`, zod schemas their output type. */
export type ShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S> ? S : T[K] extends z.ZodType<infer O, any> ? O : never;
};

/** Entity field -> id (array) / id (single); plain zod field -> its value, passed through. */
export type QueryShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S>
    ? S extends readonly (infer Item)[]
      ? EntityKey<Item>[]
      : EntityKey<S>
    : T[K] extends z.ZodType<infer O, any>
      ? O
      : never;
};

/** Writable counterpart: entity slots accept id|entity (array: a mix); plain zod field -> its value. */
export type WritableQueryShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S>
    ? S extends readonly (infer Item)[]
      ? (EntityKey<Item> | Item)[]
      : EntityKey<S> | S
    : T[K] extends z.ZodType<infer O, any>
      ? O
      : never;
};

/** The normalized shape data$ emits, derived from a denormalized shape (entity-only; kept as a default). */
export type QueryShapeOf<TShape> = {
  [K in keyof TShape]: TShape[K] extends readonly (infer Item)[] ? EntityKey<Item>[] : EntityKey<TShape[K]>;
};

/**
 * The writable counterpart of QueryShapeOf: each model slot accepts an id OR a denormalized
 * entity (or a mix, for arrays). Used by setRaw, which normalizes object elements on write.
 */
export type WritableQueryShapeOf<TShape> = {
  [K in keyof TShape]: TShape[K] extends readonly (infer Item)[]
    ? (EntityKey<Item> | Item)[]
    : EntityKey<TShape[K]> | TShape[K];
};
```

- [ ] **Step 4: Add phantom generics to `StateDescriptor`**

Replace the `StateDescriptor` type in `state.ts` with:

```ts
export type StateDescriptor<
  TParams,
  TShape,
  TMutations extends MutationDefs<TShape> = Record<never, never>,
  TQuery = QueryShapeOf<TShape>,
  TWritable = WritableQueryShapeOf<TShape>,
> = {
  /** Stable string identity for the SSR query cache. States without a key opt out of SSR caching. */
  readonly key?: string;
  // Input is `any` so schemas whose Input differs from Output (e.g. branded ids) stay assignable.
  readonly paramsSchema: z.ZodType<TParams, any>;
  readonly fields: FieldsMap;
  readonly mutations: TMutations;
  /** Phantom carriers — never set at runtime — so TQuery/TWritable are inferable from a descriptor value. */
  readonly _query?: TQuery;
  readonly _writable?: TWritable;
};
```

- [ ] **Step 5: Wire `defineState` return types**

In `state.ts`, update both overload signatures and the implementation signature so each returns the fields-driven query/writable shapes. Replace the three return-type annotations:

- No-mutations overload return:
  ```ts
  ): StateDescriptor<
    TParams,
    ShapeFromFields<TFields>,
    Record<never, never>,
    QueryShapeFromFields<TFields>,
    WritableQueryShapeFromFields<TFields>
  >;
  ```
- Mutations overload return:
  ```ts
  ): StateDescriptor<
    TParams,
    ShapeFromFields<TFields>,
    TMutations,
    QueryShapeFromFields<TFields>,
    WritableQueryShapeFromFields<TFields>
  >;
  ```
- Implementation return:
  ```ts
  ): StateDescriptor<
    TParams,
    ShapeFromFields<TFields>,
    TMutations | Record<never, never>,
    QueryShapeFromFields<TFields>,
    WritableQueryShapeFromFields<TFields>
  > {
  ```

The implementation body is unchanged (it still returns `{ key, paramsSchema, fields, mutations }` cast through `as any`; `_query`/`_writable` are phantom and never assigned).

- [ ] **Step 6: Run type-check and tests to verify pass**

Run: `pnpm --filter rxfy check-types`
Expected: PASS.
Run: `pnpm --filter rxfy test -- state.test.ts`
Expected: PASS (including existing `QueryShapeOf` test, which is untouched).

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy/src/state/state.ts packages/rxfy/src/state/state.test.ts
git commit -m "feat(rxfy): fields-driven query/writable shapes with plain value fields"
```

---

## Task 3: Runtime normalize/denormalize for plain fields

**Files:**

- Modify: `packages/rxfy/src/state/normalize.ts`
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/rxfy/src/state/normalize.test.ts`. Keep existing imports; the file already imports `array`, `createModel`, `single` from `../model/model.js`, `z`, and the three normalize functions. Append:

```ts
describe("plain value fields", () => {
  const post = createModel(z.object({ id: z.string(), title: z.string() }), {
    getKey: (x) => x.id,
    name: "norm-post",
  });
  const plainFields = {
    posts: array(post),
    isOpen: z.boolean(),
    filters: z.object({ q: z.string() }),
  };
  type PlainShape = { posts: { id: string; title: string }[]; isOpen: boolean; filters: { q: string } };

  const plainValue: PlainShape = {
    posts: [{ id: "1", title: "A" }],
    isOpen: true,
    filters: { q: "hi" },
  };

  it("normalizeResult passes plain values through and normalizes entities", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, plainFields, plainValue);
    expect(ids).toEqual({ posts: ["1"], isOpen: true, filters: { q: "hi" } });
    expect(registry.model(post).getValue("1")).toEqual({ id: "1", title: "A" });
  });

  it("denormalizeValue reads entities from the store and copies plain values", () => {
    const registry = createModelRegistry();
    normalizeResult(registry, plainFields, plainValue);
    const out = denormalizeValue<PlainShape>(registry, plainFields, {
      posts: ["1"],
      isOpen: true,
      filters: { q: "hi" },
    });
    expect(out).toEqual(plainValue);
  });

  it("normalizeWritable passes plain values through", () => {
    const registry = createModelRegistry();
    const ids = normalizeWritable(registry, plainFields, {
      posts: ["1"],
      isOpen: false,
      filters: { q: "bye" },
    });
    expect(ids).toEqual({ posts: ["1"], isOpen: false, filters: { q: "bye" } });
  });

  it("validates plain values in dev and throws on mismatch", () => {
    const registry = createModelRegistry();
    expect(() =>
      normalizeResult(registry, plainFields, { posts: [], isOpen: "nope" as never, filters: { q: "x" } }),
    ).toThrow();
  });

  it("skips plain validation when NODE_ENV is production", () => {
    const registry = createModelRegistry();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const ids = normalizeResult(registry, plainFields, { posts: [], isOpen: "nope" as never, filters: { q: "x" } });
      expect(ids).toEqual({ posts: [], isOpen: "nope", filters: { q: "x" } });
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter rxfy test -- normalize.test.ts`
Expected: FAIL — plain fields currently hit `desc.model`/`desc.kind` and throw or misbehave.

- [ ] **Step 3: Rewrite `normalize.ts`**

Replace the entire contents of `packages/rxfy/src/state/normalize.ts` with:

```ts
import type { z } from "zod";
import { isFieldDescriptor, type ModelDescriptor } from "../model/model.js";
import type { IModelRegistry, ModelStore } from "../model/model-store.js";
import type { FieldsMap, QueryShapeOf, WritableQueryShapeOf } from "./state.js";

/** Dev-only validation for plain (non-entity) field values; pass-through in production. */
function devParse(schema: z.ZodType<any, any>, value: unknown): unknown {
  if (process.env.NODE_ENV === "production") return value;
  return schema.parse(value);
}

/** Splits a denormalized fetch result: entities → model stores, ids → returned query shape. Plain values pass through. */
export function normalizeResult<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  value: TShape,
): QueryShapeOf<TShape> {
  const ids: Record<string, unknown> = {};
  for (const [fieldName, entry] of Object.entries(fields)) {
    const fieldValue = (value as Record<string, unknown>)[fieldName];
    if (!isFieldDescriptor(entry)) {
      ids[fieldName] = devParse(entry, fieldValue);
      continue;
    }
    const store = registry.model(entry.model);
    if (entry.kind === "array") {
      const items = fieldValue as unknown[];
      store.setMany(items);
      ids[fieldName] = items.map((item) => entry.model.getKey(item));
    } else {
      const key = entry.model.getKey(fieldValue);
      store.set(key, fieldValue);
      ids[fieldName] = key;
    }
  }
  return ids as QueryShapeOf<TShape>;
}

/** Rebuilds the fetch shape from ids by reading store value maps; plain values are copied verbatim. */
export function denormalizeValue<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  ids: QueryShapeOf<TShape>,
): TShape {
  const value: Record<string, unknown> = {};
  for (const [fieldName, entry] of Object.entries(fields)) {
    const fieldIds = (ids as Record<string, unknown>)[fieldName];
    if (!isFieldDescriptor(entry)) {
      value[fieldName] = fieldIds;
      continue;
    }
    const store = registry.model(entry.model);
    const read = (key: string): unknown => {
      const e = store.getValue(key);
      if (e === undefined) {
        throw new Error(
          `rxfy: entity "${key}" for model "${entry.model.name ?? "<unnamed>"}" is missing from the store during denormalization`,
        );
      }
      return e;
    };
    value[fieldName] = entry.kind === "array" ? (fieldIds as string[]).map(read) : read(fieldIds as string);
  }
  return value as TShape;
}

/** Resolve one model-field element to its id, writing the entity to its store when given an object. */
function toEntityId(store: ModelStore<any>, model: ModelDescriptor<any, any>, el: unknown): string {
  if (typeof el === "string") return el; // already an id — passthrough, no store write
  if (process.env.NODE_ENV !== "production") {
    const parsed = model.schema.safeParse(el);
    if (!parsed.success) {
      throw new Error(
        `rxfy: invalid entity passed to setRaw for model "${model.name ?? "<unnamed>"}": ${parsed.error.message}`,
      );
    }
  }
  const key = model.getKey(el);
  store.set(key, el);
  return key;
}

/**
 * Like normalizeResult, but tolerates already-normalized ids mixed with denormalized entities:
 * string elements pass through as ids; object elements are written to their store. Plain (zod)
 * fields pass through, dev-validated. Used by setRaw so callers can append entities without a
 * manual normalizeResult round-trip.
 */
export function normalizeWritable<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  value: WritableQueryShapeOf<TShape>,
): QueryShapeOf<TShape> {
  const ids: Record<string, unknown> = {};
  for (const [fieldName, entry] of Object.entries(fields)) {
    const fieldValue = (value as Record<string, unknown>)[fieldName];
    if (!isFieldDescriptor(entry)) {
      ids[fieldName] = devParse(entry, fieldValue);
      continue;
    }
    const store = registry.model(entry.model);
    if (entry.kind === "array") {
      ids[fieldName] = (fieldValue as unknown[]).map((el) => toEntityId(store, entry.model, el));
    } else {
      ids[fieldName] = toEntityId(store, entry.model, fieldValue);
    }
  }
  return ids as QueryShapeOf<TShape>;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm --filter rxfy test -- normalize.test.ts`
Expected: PASS (new + existing).
Run: `pnpm --filter rxfy test`
Expected: PASS (full core suite, confirms no regression).

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "feat(rxfy): normalize plain value fields with dev-only validation"
```

---

## Task 4: Thread `TQuery`/`TWritable` through `useStateData` (plain fields end-to-end)

**Files:**

- Modify: `packages/rxfy-react/src/useStateData.ts`
- Test: `packages/rxfy-react/src/useStateData.test.tsx`

- [ ] **Step 1: Write failing test**

Append to `packages/rxfy-react/src/useStateData.test.tsx`:

```ts
describe("plain value fields", () => {
  const plainState = defineState({
    key: "plain",
    params: z.object({ id: z.string() }),
    model: { posts: array(postModel), isOpen: z.boolean(), filters: z.object({ q: z.string() }) },
    mutations: {
      setOpen: (prev, open: boolean) => ({ ...prev, isOpen: open }),
    },
  });

  it("emits plain values alongside entity ids", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [{ id: "1", title: "P1" }],
      isOpen: true,
      filters: { q: "hello" },
    });
    const { result } = renderHook(() => useStateData({ state: plainState, fetchFn, params: { id: "x" } }), { wrapper });
    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["1"]);
    expect(data.isOpen).toBe(true);
    expect(data.filters).toEqual({ q: "hello" });
  });

  it("updates a plain value through a mutation", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [], isOpen: false, filters: { q: "" } });
    const { result } = renderHook(() => useStateData({ state: plainState, fetchFn, params: { id: "y" } }), { wrapper });
    await firstValueFrom(result.current.data$);
    act(() => result.current.mutations.setOpen(true));
    const data = await firstValueFrom(result.current.data$);
    expect(data.isOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter rxfy-react test -- useStateData.test.tsx`
Expected: FAIL — `data.isOpen`/`data.filters` are typed away (compile error under `check-types`) and/or `data.isOpen` is `undefined` because the query shape currently maps plain fields to ids.

> Note: today the runtime already passes plain values through after Task 3, so the runtime assertions may pass; the failure this task fixes is the **type** of `data$` (plain fields would be `string`, not their real type). Verify with `pnpm --filter rxfy-react check-types` → FAIL before the change.

- [ ] **Step 3: Thread the generics**

In `packages/rxfy-react/src/useStateData.ts`:

a) Leave the imports unchanged — `QueryShapeOf` and `WritableQueryShapeOf` stay imported because they are the default generics on `StateHandle` below. No new imports are needed (`FieldsMap` is still imported for `state.fields as FieldsMap`).

b) Replace `StateHandle` with:

```ts
export type StateHandle<
  TShape,
  TMutations extends MutationDefs<TShape> = Record<never, never>,
  TQuery = QueryShapeOf<TShape>,
  TWritable = WritableQueryShapeOf<TShape>,
> = {
  /** Normalized query state — entity ids plus plain field values. Read entity data through model stores. */
  readonly data$: Observable<TQuery>;
  readonly set: (value: Updater<TShape>) => void;
  /**
   * Low-level sibling of `set` that writes the **id shape** directly — no denormalize round-trip.
   * Entity slots accept ids, denormalized entities, or a mix; plain fields take their value. The
   * updater receives the current shape and must return the writable shape; it is a no-op until the
   * query is FULFILLED. Use for append / prepend / reorder / dedup where re-normalizing the whole
   * list (`set`) would be O(N).
   */
  readonly setRaw: (ids: TWritable | ((prev: TQuery) => TWritable)) => void;
  readonly reload: () => void;
  readonly mutations: BoundMutations<TShape, TMutations>;
};
```

c) Replace `UseStateDataConfig` with:

```ts
export type UseStateDataConfig<TParams, TShape, TMutations extends MutationDefs<TShape>, TQuery, TWritable> = {
  /** The typed, normalized state descriptor (`defineState`). */
  state: StateDescriptor<TParams, TShape, TMutations, TQuery, TWritable>;
  /** Fetches the full denormalized shape; `params` identity drives refetch. */
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>;
  params: TParams;
  /** Seed value (e.g. from a router loader) used until the first fetch settles. */
  defaultData?: TShape;
};
```

d) Update the function signature and the internal `QueryShapeOf<TShape>` / `WritableQueryShapeOf<TShape>` references. Change the declaration to:

```ts
export function useStateData<TParams, TShape, TMutations extends MutationDefs<TShape>, TQuery, TWritable>({
  state,
  fetchFn,
  params,
  defaultData,
}: UseStateDataConfig<TParams, TShape, TMutations, TQuery, TWritable>): StateHandle<TShape, TMutations, TQuery, TWritable> {
```

Then inside the body, replace every `QueryShapeOf<TShape>` with `TQuery` and every `WritableQueryShapeOf<TShape>` with `TWritable`. Specifically:

- `atom$: Atom<IWrapped<TQuery>>`
- `registry.queries.getQuery<TQuery>(cacheKey)`
- `createAtom<IWrapped<TQuery>>(createIdle())`
- `let data$: Observable<TQuery>;`
- `const writeThrough = (ids: TQuery) => {`
- `const setRaw = (idsOrUpdater: TWritable | ((prev: TQuery) => TWritable)) => {`

The calls to `normalizeResult`/`normalizeWritable`/`denormalizeValue` return/accept the structural shapes and are already cast through their own generics; cast their results to the local generic where TypeScript needs help, e.g.:

- `atom$.set(createFulfilled(normalizeResult(registry, fields, defaultData) as TQuery));`
- in `settle`: `atom$.set(createFulfilled(normalizeResult(registry, fields, result) as TQuery));`
- in `writeThrough` callers: `writeThrough(normalizeResult(registry, fields, updater(prev)) as TQuery);` and `writeThrough(normalizeResult(registry, fields, valueOrUpdater) as TQuery);`
- in `setRaw`: the updater is `(prev: TQuery) => TWritable`, so call it as `idsOrUpdater(current.value)` (no cast), then cast the `normalizeWritable` argument since `TWritable` is opaque to it: `writeThrough(normalizeWritable(registry, fields, idsOrUpdater(current.value) as never) as TQuery);` and `writeThrough(normalizeWritable(registry, fields, idsOrUpdater as never) as TQuery);`
- in `applyUpdate`: `const prev = denormalizeValue<TShape>(registry, fields, current.value as never);`

> Rationale for the casts: `normalizeResult`/`normalizeWritable` are generic over the _denormalized_ `TShape` and operate on the structural `QueryShapeOf<TShape>`/`WritableQueryShapeOf<TShape>`, which equal `TQuery`/`TWritable` for these fields, but the compiler cannot prove the relationship to the opaque `TQuery`/`TWritable` type parameters. The casts (`as never` on inputs, `as TQuery` on outputs) are sound because `TQuery`/`TWritable` are exactly the fields-driven shapes the descriptor was built from.

- [ ] **Step 4: Run check-types and tests**

Run: `pnpm --filter rxfy-react check-types`
Expected: PASS.
Run: `pnpm --filter rxfy-react test -- useStateData.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/useStateData.ts packages/rxfy-react/src/useStateData.test.tsx
git commit -m "feat(rxfy-react): type data\$ from fields so plain values keep their type"
```

---

## Task 5: Local / sync state mode

**Files:**

- Modify: `packages/rxfy-react/src/useStateData.ts`
- Test: `packages/rxfy-react/src/useStateData.local.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-react/src/useStateData.local.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { array, createModel, defineState } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useStateData } from "./useStateData.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), {
  getKey: (x) => x.id,
  name: "local-todo",
});

const counterState = defineState({
  params: z.object({}),
  model: { count: z.number(), todos: array(todoModel), isOpen: z.boolean() },
  mutations: {
    inc: (prev) => ({ ...prev, count: prev.count + 1 }),
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("useStateData local mode", () => {
  it("emits the initial value synchronously with no fetch", async () => {
    const { result } = renderHook(
      () =>
        useStateData({
          state: counterState,
          initial: { count: 5, todos: [{ id: "1", title: "A" }], isOpen: false },
        }),
      { wrapper },
    );
    const data = await firstValueFrom(result.current.data$);
    expect(data.count).toBe(5);
    expect(data.todos).toEqual(["1"]);
    expect(data.isOpen).toBe(false);
  });

  it("updates via mutations and set", async () => {
    const { result } = renderHook(
      () => useStateData({ state: counterState, initial: { count: 0, todos: [], isOpen: false } }),
      { wrapper },
    );
    act(() => result.current.mutations.inc());
    expect((await firstValueFrom(result.current.data$)).count).toBe(1);
    act(() => result.current.set((prev) => ({ ...prev, isOpen: true })));
    expect((await firstValueFrom(result.current.data$)).isOpen).toBe(true);
  });

  it("reload() resets to the initial value", async () => {
    const { result } = renderHook(
      () => useStateData({ state: counterState, initial: { count: 0, todos: [], isOpen: false } }),
      { wrapper },
    );
    act(() => result.current.mutations.inc());
    expect((await firstValueFrom(result.current.data$)).count).toBe(1);
    act(() => result.current.reload());
    expect((await firstValueFrom(result.current.data$)).count).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter rxfy-react test -- useStateData.local.test.tsx`
Expected: FAIL — `initial` is not an accepted config property (type error) and there is no local seeding/reset behavior.

- [ ] **Step 3: Make the config a discriminated union**

In `packages/rxfy-react/src/useStateData.ts`, replace the `UseStateDataConfig` type (from Task 4) with a union plus the two member types:

```ts
type RemoteStateConfig<TParams, TShape, TMutations extends MutationDefs<TShape>, TQuery, TWritable> = {
  /** The typed, normalized state descriptor (`defineState`). */
  state: StateDescriptor<TParams, TShape, TMutations, TQuery, TWritable>;
  /** Fetches the full denormalized shape; `params` identity drives refetch. */
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>;
  params: TParams;
  /** Seed value (e.g. from a router loader) used until the first fetch settles. */
  defaultData?: TShape;
  initial?: never;
};

type LocalStateConfig<TParams, TShape, TMutations extends MutationDefs<TShape>, TQuery, TWritable> = {
  /** The typed, normalized state descriptor (`defineState`). */
  state: StateDescriptor<TParams, TShape, TMutations, TQuery, TWritable>;
  /** The initial denormalized value for pure local/sync state (no fetch). */
  initial: TShape;
  fetchFn?: never;
  params?: never;
  defaultData?: never;
};

export type UseStateDataConfig<TParams, TShape, TMutations extends MutationDefs<TShape>, TQuery, TWritable> =
  | RemoteStateConfig<TParams, TShape, TMutations, TQuery, TWritable>
  | LocalStateConfig<TParams, TShape, TMutations, TQuery, TWritable>;
```

- [ ] **Step 4: Destructure the union and branch the hook body**

Replace the function signature (the destructured params from Task 4) so it takes a single `config` and derives typed locals:

```ts
export function useStateData<TParams, TShape, TMutations extends MutationDefs<TShape>, TQuery, TWritable>(
  config: UseStateDataConfig<TParams, TShape, TMutations, TQuery, TWritable>,
): StateHandle<TShape, TMutations, TQuery, TWritable> {
  const { state } = config;
  const isLocal = config.fetchFn === undefined;
  const fetchFn = config.fetchFn;
  const params = config.params as TParams;
  const defaultData = config.defaultData;
  const initial = config.initial;

  const registry = useModelRegistry();
  const ssr = useContext(SsrContext);

  const [reloadEpoch, setReloadEpoch] = useState(0);

  const paramsKey = stableStringify(config.params);
  const cacheKey = state.key ? `${state.key}:${paramsKey}` : undefined;
```

Then make three edits inside the `useMemo`:

(1) Replace the `defaultData` seeding block with a unified seed that also covers local mode:

```ts
// Seed the atom when it hasn't been populated yet. Local mode seeds from `initial`; remote mode
// from `defaultData` (router loader handoff). Only the first-IDLE seed reads it.
const seed = isLocal ? initial : defaultData;
if (seed !== undefined && atom$.get().type === StatusEnum.IDLE) {
  atom$.set(createFulfilled(normalizeResult(registry, fields, seed) as TQuery));
}
```

(2) Guard `runFetch` so it is a no-op without a `fetchFn` (local mode never fetches, and this keeps TypeScript happy about the optional `fetchFn`):

```ts
const runFetch = () => {
  if (!fetchFn) return;
  inFlight.controller?.abort();
  const controller = new AbortController();
  inFlight.controller = controller;
  atom$.set(createPending());
  void settle(fetchFn(params, controller.signal), controller.signal);
};
```

Also guard the SSR on-demand fetch block so local (already-FULFILLED) states skip it — it is already gated on `atom$.get().type === StatusEnum.IDLE`, which is false after seeding, so no change is needed there. Inside it, `fetchFn(params, ...)` must be reachable only in remote mode; since local is FULFILLED it never enters. Leave as-is.

(3) Replace `reload` so local mode resets to `initial`:

```ts
const reload = () => {
  if (isLocal) {
    if (initial !== undefined) writeThrough(normalizeResult(registry, fields, initial) as TQuery);
    return;
  }
  if (atom$.get().type === StatusEnum.REJECTED) {
    atom$.set(createIdle());
    setReloadEpoch((e) => e + 1);
  } else {
    runFetch();
  }
};
```

Finally, update the `useMemo` dependency array to include the local-mode inputs. Replace the deps line:

```ts
  }, [state, registry, ssr, cacheKey, paramsKey, reloadEpoch, isLocal]);
```

> `initial`/`defaultData`/`fetchFn` remain intentionally excluded from the deps (captured by closure) to keep `data$` identity stable — same discipline as before; `isLocal` is added because it switches `reload`/seed behavior and is derived from a stable config shape.

- [ ] **Step 5: Run check-types and tests**

Run: `pnpm --filter rxfy-react check-types`
Expected: PASS.
Run: `pnpm --filter rxfy-react test -- useStateData.local.test.tsx`
Expected: PASS.
Run: `pnpm --filter rxfy-react test`
Expected: PASS (full react suite — confirms remote mode, paged data, SSR untouched).

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy-react/src/useStateData.ts packages/rxfy-react/src/useStateData.local.test.tsx
git commit -m "feat(rxfy-react): local sync state via initial (no fetchFn), reload resets"
```

---

## Task 6: Full verification, changeset, docs

**Files:**

- Create: `.changeset/plain-state-fields-and-local-state.md`

- [ ] **Step 1: Run the full build, test, and type-check across the monorepo**

Run: `pnpm --filter rxfy test && pnpm --filter rxfy-react test`
Expected: PASS (all suites).
Run: `turbo check-types`
Expected: PASS.
Run: `turbo build`
Expected: PASS (tsup emits ESM+CJS+d.ts for both packages with no type errors).

- [ ] **Step 2: Create the changeset**

Create `.changeset/plain-state-fields-and-local-state.md`:

```md
---
"rxfy": minor
"rxfy-react": minor
---

Support plain (non-normalized) value fields in `defineState` and local/sync state in `useStateData`.

- `defineState({ model })` now accepts a bare zod schema as a field entry to declare a plain value
  (boolean, primitive, or object). Such fields live in the query state and pass through `data$`
  unchanged, distinct from `array()`/`single()` entity fields that normalize into model stores.
  Plain values are validated against their schema in development and passed through in production.
- `useStateData` accepts a local/sync config: pass `initial` (the denormalized shape) instead of
  `fetchFn`/`params` to get pure local state seeded synchronously with no fetch and no PENDING.
  In local mode, `reload()` resets the state to `initial`.
```

- [ ] **Step 3: Verify the changeset is picked up**

Run: `pnpm changeset status`
Expected: lists `rxfy` and `rxfy-react` as `minor` bumps.

- [ ] **Step 4: Commit**

```bash
git add .changeset/plain-state-fields-and-local-state.md
git commit -m "chore: changeset for plain state fields and local sync state"
```

---

## Self-Review Notes

- **Spec coverage:** Part A (plain fields) → Tasks 1–4; Part B (local state) → Task 5; SSR (plain values ride the query cache, no code change) covered by Task 4's keyed `plainState` test exercising the query atom; validation dev-only → Task 3. Affected-files list in the spec maps 1:1 to Tasks 1–6.
- **Type consistency:** `isFieldDescriptor` (Task 1) is used by `normalize.ts` (Task 3); `QueryShapeFromFields`/`WritableQueryShapeFromFields` and the `_query`/`_writable` phantom carriers (Task 2) are consumed by `defineState` (Task 2) and inferred by `useStateData`/`StateHandle` (Tasks 4–5); `TQuery`/`TWritable` names are consistent across `state.ts`, `useStateData.ts`, and `StateHandle`.
- **Backward compatibility:** `StateDescriptor`'s new generics default to the existing `QueryShapeOf`/`WritableQueryShapeOf`, so entity-only states and external `StateDescriptor<P,S,M>` references are unaffected; `useStatePagedData` passes `state.fields` (typed `FieldsMap`) to `normalizeResult` unchanged.

```

```
