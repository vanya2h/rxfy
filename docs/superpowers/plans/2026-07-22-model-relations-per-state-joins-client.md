# Model Relations with Per-State Joins (Client Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a single model declare relation fields (`ref`/`refArray`) that a state joins per-fetch (`.with`/`join`), so list and detail payloads share one normalized store, with `get` statically gated to framework-minted `StoreKey`s.

**Architecture:** Two layers. (1) A phantom `StoreKey<T>` brand, minted by the query-shape type layer, retypes `ModelStore.get` so arbitrary strings can't reach the store; `asKey` is the explicit door for raw ids. (2) Relations are declared in the model schema via `ref()`/`refArray()` (extracted into a descriptor relation map by a `.shape` walk), and joins are declared per state field via `.with({...})`/`join(Model, {...})`; a recursive `writeEntity` normalizer extracts joined entities into their stores (always-replace) and the query-shape types gate which relations are readable.

**Tech Stack:** TypeScript (advanced mapped types), zod 4 (registries + `.shape`), RxJS, Vitest (`expectTypeOf`, `@ts-expect-error`), React 18 (rxfy-react).

**Scope:** Client core only — `packages/rxfy` and `packages/rxfy-react`. Server integration (`sync.serve` recursion) and sync topic/grant recursion are a **follow-up plan** (Plan B), noted at the end. This plan produces working, testable software: a client `fetchFn` returning a joined payload exercises the entire relations path.

**Spec:** `docs/superpowers/specs/2026-07-21-model-relations-per-state-joins-design.md`

**Conventions to follow:**

- Run a single package's tests: `pnpm --filter rxfy test`, type-check: `pnpm --filter rxfy check-types`.
- Tests are colocated (`foo.ts` → `foo.test.ts`), import with `.js` extensions.
- Type tests use `expectTypeOf<X>().toEqualTypeOf<Y>()` and `// @ts-expect-error` (see `packages/rxfy/src/state/state.test.ts`).
- Prettier: 120 width, double quotes, semicolons.
- Commits: no `Co-Authored-By` trailer.

---

## Phase 1 — `StoreKey` brand + gated `get` (backward-compatible foundation)

### Task 1: `StoreKey<T>` brand type and `asKey` helper

**Files:**

- Modify: `packages/rxfy/src/model/model.ts`
- Test: `packages/rxfy/src/model/model.test.ts`

- [ ] **Step 1: Write the failing type + runtime test**

Add to `packages/rxfy/src/model/model.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from "vitest";
import { asKey, type StoreKey } from "./model.js";

describe("StoreKey", () => {
  it("is assignable to string but string is not assignable to it", () => {
    expectTypeOf<StoreKey<{ id: string }>>().toMatchTypeOf<string>();
    // @ts-expect-error — a bare string is not a StoreKey (this is the whole point)
    const bad: StoreKey<{ id: string }> = "x";
    void bad;
  });

  it("asKey brands a raw id as a StoreKey for the model's entity", () => {
    const m = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "sk" });
    const key = asKey(m, "abc");
    expectTypeOf(key).toEqualTypeOf<StoreKey<{ id: string }>>();
    expect(key).toBe("abc"); // phantom brand — runtime value is the raw id
  });
});
```

(The file already imports `createModel`, `z`. Keep one import line per symbol; merge the `asKey`/`StoreKey` import into the existing `./model.js` import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test model.test -- --run`
Expected: FAIL — `asKey`/`StoreKey` not exported.

- [ ] **Step 3: Implement `StoreKey` and `asKey`**

Add to `packages/rxfy/src/model/model.ts` (after `EntityKey`):

```ts
/**
 * A store key the framework minted for a specific model's store. A required phantom brand (never
 * present at runtime) so a bare `string` is NOT assignable to it — this is what lets `ModelStore.get`
 * reject arbitrary ids. Still a subtype of `string`, so interpolation/keys/`String(...)` are unaffected.
 * The query-shape layer produces these; `asKey` is the explicit door for a genuinely-raw id.
 */
export type StoreKey<TEntity> = EntityKey<TEntity> & { readonly __store: (e: TEntity) => void };

/** The entity type carried by a model descriptor. */
export type EntityOfModel<TDescriptor> =
  TDescriptor extends ModelDescriptor<infer TEntity, any, any, any> ? TEntity : never;

/** Brand a raw id (e.g. a URL param) as a `StoreKey` for a model. The one sanctioned cast into the keyspace. */
export function asKey<TDescriptor extends ModelDescriptor<any, any, any, any>>(
  _model: TDescriptor,
  id: string,
): StoreKey<EntityOfModel<TDescriptor>> {
  return id as StoreKey<EntityOfModel<TDescriptor>>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test model.test -- --run` → PASS.
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model.ts packages/rxfy/src/model/model.test.ts
git commit -m "feat(rxfy): add StoreKey brand and asKey helper"
```

---

### Task 2: Retype `ModelStore.get` to require `StoreKey`

**Files:**

- Modify: `packages/rxfy/src/model/model-store.ts` (type on `ModelStore.get`, line ~13)
- Test: `packages/rxfy/src/model/model-store.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/model/model-store.test.ts`:

```ts
import { asKey } from "./model.js";

describe("get is gated to StoreKey", () => {
  const m = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "gated" });

  it("accepts a StoreKey (via asKey) and rejects a raw string at the type level", () => {
    const reg = createModelRegistry(m);
    const store = reg.model(m);
    store.set("a", { id: "a" });
    expect(store.get(asKey(m, "a")).get()).toEqual({ id: "a" });
    // @ts-expect-error — a raw string is no longer accepted by get
    store.get("a");
  });
});
```

(Reuse the file's existing `createModel`, `createModelRegistry`, `z` imports; add `asKey`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test model-store.test -- --run`
Expected: FAIL — currently `store.get("a")` compiles, so the `@ts-expect-error` is unused → type error / test failure.

- [ ] **Step 3: Retype `get`**

In `packages/rxfy/src/model/model-store.ts`, change the `get` signature in the `ModelStore<TEntity>` type (only the signature; the runtime impl already treats the key as a string via `key as string`):

```ts
get: (key: StoreKey<TEntity>) => IAtom<TEntity>;
```

Update the import at the top of the file:

```ts
import type { EntityKey, ModelDescriptor, StoreKey } from "./model.js";
```

`set`, `setMany`, `getValue`, `valueEntries`, `added$` stay untouched (writable/raw paths keep `string`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test model-store.test -- --run` → PASS.
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model-store.ts packages/rxfy/src/model/model-store.test.ts
git commit -m "feat(rxfy): gate ModelStore.get to StoreKey"
```

---

### Task 3: Brand query-shape entity ids as `StoreKey`

**Files:**

- Modify: `packages/rxfy/src/state/state.ts` (`QueryShapeFromFields` ~15-23, `QueryShapeOf` ~46-48)
- Test: `packages/rxfy/src/state/state.test.ts`

- [ ] **Step 1: Write the failing type test**

Add to `packages/rxfy/src/state/state.test.ts`:

```ts
import type { StoreKey } from "../model/model.js";

describe("query-shape ids are StoreKeys", () => {
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string() }),
    getKey: (p) => p.id,
    name: "p3",
  });
  const fields = { posts: array(post), owner: single(post) };

  it("brands entity fields (array + single) as StoreKey; existing get(state.field) still compiles", () => {
    expectTypeOf<QueryShapeFromFields<typeof fields>>().toEqualTypeOf<{
      posts: StoreKey<{ id: string; title: string }>[];
      owner: StoreKey<{ id: string; title: string }>;
    }>();
  });
});
```

(Reuse existing `createModel`/`array`/`single`/`z`/`QueryShapeFromFields` imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test state.test -- --run`
Expected: FAIL — fields currently map to `EntityKey<...>`, not `StoreKey<...>`.

- [ ] **Step 3: Rebrand the read query-shape mapped types**

In `packages/rxfy/src/state/state.ts`, update the import and the two READ mapped types (leave `WritableQueryShapeFromFields`/`WritableQueryShapeOf` on `EntityKey` — writes stay loose):

```ts
import type { EntityKey, FieldDescriptor, StoreKey } from "../model/model.js";
```

`QueryShapeFromFields` — replace the two `EntityKey` occurrences:

```ts
export type QueryShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S>
    ? S extends readonly (infer Item)[]
      ? StoreKey<Item>[]
      : StoreKey<S>
    : T[K] extends z.ZodType<infer O, any>
      ? O
      : never;
};
```

`QueryShapeOf` — same substitution:

```ts
export type QueryShapeOf<TShape> = {
  [K in keyof TShape]: TShape[K] extends readonly (infer Item)[] ? StoreKey<Item>[] : StoreKey<TShape[K]>;
};
```

- [ ] **Step 4: Run tests + type-check across the workspace**

Run: `pnpm --filter rxfy test -- --run` → PASS (existing state tests that asserted `EntityKey`/`string` may need updating — see Step 4b).
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 4b: Fix existing type assertions broken by the rebrand**

Existing tests in `state.test.ts` assert query shapes like `{ items: string[]; owner: string }`. `StoreKey<T>` is assignable to `string` but not equal to it, so `toEqualTypeOf<... string ...>` assertions on entity fields will fail. Update each such assertion to the `StoreKey<Entity>` form (mirror Step 1). Do NOT change assertions for plain zod fields (those stay their output type). Re-run until green.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/state.ts packages/rxfy/src/state/state.test.ts
git commit -m "feat(rxfy): brand query-shape entity ids as StoreKey"
```

---

## Phase 2 — Relation declaration (`ref`/`refArray` + relation map)

### Task 4: `ref()` / `refArray()` markers via a zod registry

**Files:**

- Modify: `packages/rxfy/src/model/model.ts`
- Test: `packages/rxfy/src/model/model.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/model/model.test.ts`:

```ts
import { ref, refArray, relationRegistry } from "./model.js";

describe("ref / refArray", () => {
  const cat = createModel({ schema: z.object({ id: z.string(), name: z.string() }), getKey: (c) => c.id, name: "cat" });

  it("registers single-relation metadata against the field schema", () => {
    const schema = ref(cat);
    expect(relationRegistry.get(schema)).toEqual({ model: cat, kind: "single" });
  });

  it("registers array-relation metadata", () => {
    const schema = refArray(cat);
    expect(relationRegistry.get(schema)).toEqual({ model: cat, kind: "array" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test model.test -- --run`
Expected: FAIL — `ref`/`refArray`/`relationRegistry` not exported.

- [ ] **Step 3: Implement the registry + `ref`/`refArray`**

Add to `packages/rxfy/src/model/model.ts` (import `z` as a value — it currently imports only the type):

```ts
import { z } from "zod";
```

```ts
export type RelationMeta = { readonly model: ModelDescriptor<any, any>; readonly kind: "single" | "array" };

/** Attaches relation metadata to a field schema so `createModel` can find it while walking `.shape`. */
export const relationRegistry = z.registry<RelationMeta>();

/**
 * Declare a to-one relation field inside a model schema. Output type is the referenced entity's
 * `StoreKey` (optional — the field is absent on a fetch that did not join it); input accepts the id
 * or the joined entity so joined payloads type-check. Store extraction happens in `writeEntity`, not
 * in zod parse — here it is purely a marker + type.
 */
export function ref<TEntity, TKey extends string, TInput>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): z.ZodType<StoreKey<TEntity> | undefined, StoreKey<TEntity> | TInput | undefined> {
  // Accepts undefined (field absent when not joined) or a string id (after normalization).
  const schema = z.custom<StoreKey<TEntity> | undefined>((v) => v === undefined || typeof v === "string");
  schema.register(relationRegistry, { model, kind: "single" });
  return schema as unknown as z.ZodType<StoreKey<TEntity> | undefined, StoreKey<TEntity> | TInput | undefined>;
}

/** Declare a to-many relation field inside a model schema (array of `ref`). Optional for the same reason. */
export function refArray<TEntity, TKey extends string, TInput>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): z.ZodType<StoreKey<TEntity>[] | undefined, (StoreKey<TEntity> | TInput)[] | undefined> {
  const schema = z.custom<StoreKey<TEntity>[] | undefined>((v) => v === undefined || Array.isArray(v));
  schema.register(relationRegistry, { model, kind: "array" });
  return schema as unknown as z.ZodType<StoreKey<TEntity>[] | undefined, (StoreKey<TEntity> | TInput)[] | undefined>;
}
```

> Notes: (1) `z.custom` validators are used because the field's runtime value after normalization is an id string / string[]. (2) The schemas accept `undefined` so a non-joined payload (which omits the relation field entirely) still passes `schema.parse` in `writeEntity`. (3) The registry entry is keyed by the exact schema instance, which `.shape` returns unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test model.test -- --run` → PASS.
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model.ts packages/rxfy/src/model/model.test.ts
git commit -m "feat(rxfy): add ref/refArray relation markers"
```

---

### Task 5: `createModel` derives the relation map (with fail-fast)

**Files:**

- Modify: `packages/rxfy/src/model/model.ts` (`ModelDescriptor` type + `createModel`)
- Test: `packages/rxfy/src/model/model.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/model/model.test.ts`:

```ts
describe("createModel relations", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "cat5",
  });

  it("collects a relation map from ref/refArray fields, ignoring plain fields", () => {
    const post = createModel({
      schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
      getKey: (p) => p.id,
      name: "post5",
    });
    expect(post.relations).toEqual({ category: { model: cat, kind: "single" } });
  });

  it("fails fast when the schema has no reachable top-level .shape (ref would be invisible)", () => {
    expect(() =>
      createModel({
        // An intersection has no top-level `.shape`, so a relation field would be silently missed.
        schema: z.object({ id: z.string() }).and(z.object({ category: ref(cat) })),
        getKey: (p: { id: string }) => p.id,
        name: "post5bad",
      }),
    ).toThrow(/rxfy: model "post5bad" schema must be a plain object/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test model.test -- --run`
Expected: FAIL — `post.relations` is `undefined`; no throw.

- [ ] **Step 3: Add `relations` to the descriptor and walk `.shape` in `createModel`**

In `packages/rxfy/src/model/model.ts`, add `relations` to `ModelDescriptor`:

```ts
export type ModelDescriptor<TEntity, TKey extends string = string, TInput = TEntity, TName extends string = string> = {
  readonly _key: symbol;
  readonly name: TName;
  readonly schema: z.ZodType<TEntity, any>;
  readonly getKey: (item: TEntity) => TKey;
  readonly _input?: (input: TInput) => void;
  /** Relation fields (from `ref`/`refArray`) keyed by field name; derived at `createModel` time. */
  readonly relations: Readonly<Record<string, RelationMeta>>;
};
```

Replace `createModel`'s body to derive `relations`:

```ts
export function createModel<TEntity, TKey extends string, TInput = TEntity, TName extends string = string>({
  schema,
  getKey,
  name,
}: CreateModelConfig<TEntity, TKey, TInput, TName>): ModelDescriptor<TEntity, TKey, TInput, TName> {
  return { _key: Symbol(), name, schema, getKey, relations: collectRelations(schema, name) };
}

/** Walk a model schema's top-level `.shape` and collect any relation-tagged fields. */
function collectRelations(schema: z.ZodType<any, any>, name: string): Record<string, RelationMeta> {
  // Unwrap benign wrappers that keep a ZodObject reachable (brand, a single refine).
  let inner: any = schema;
  while (inner?.def?.type === "pipe" || inner?.def?.innerType) {
    inner = inner.def?.innerType ?? inner.def?.in ?? inner;
    if (inner === schema.def?.innerType) break;
  }
  const shape = (inner as { shape?: Record<string, z.ZodType<any, any>> }).shape;
  const relations: Record<string, RelationMeta> = {};
  if (!shape || typeof shape !== "object") {
    // Only fail if there is nothing to walk AND relations might exist. A non-object schema with a
    // relation is unusable, so fail fast regardless.
    throw new Error(`rxfy: model "${name}" schema must be a plain object to declare relation fields`);
  }
  for (const [field, fieldSchema] of Object.entries(shape)) {
    const meta = relationRegistry.get(fieldSchema);
    if (meta) relations[field] = meta;
  }
  return relations;
}
```

> The unwrap loop is intentionally conservative. If `.shape` is reachable (plain object, `.brand()`), relations are collected; otherwise `createModel` throws. Verify against the two tests; adjust the wrapper detection to zod 4's actual `.def` shape as needed (`pnpm --filter rxfy check-types` + the failing-fast test are the contract).

Update the two other `ModelDescriptor` literal constructions if any exist (search `_key: Symbol()`); only `createModel` builds them, so no other change is expected. If TypeScript complains that `relations` is missing anywhere a `ModelDescriptor` is built by hand in tests, add `relations: {}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test model.test -- --run` → PASS.
Run: `pnpm --filter rxfy test -- --run` → PASS (nothing else references `.relations` yet).
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model.ts packages/rxfy/src/model/model.test.ts
git commit -m "feat(rxfy): derive relation map on createModel with fail-fast"
```

---

## Phase 3 — Per-state joins (`.with` / `join` + type threading)

### Task 6: `.with()` builder and `join()` standalone (runtime include map)

**Files:**

- Modify: `packages/rxfy/src/model/model.ts` (`FieldDescriptor`, `single`, `array`, add `join`)
- Test: `packages/rxfy/src/model/model.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/model/model.test.ts`:

```ts
import { join } from "./model.js";

describe(".with / join include map", () => {
  const cat = createModel({ schema: z.object({ id: z.string() }), getKey: (c) => c.id, name: "cat6" });
  const post = createModel({
    schema: z.object({ id: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "post6",
  });

  it(".with attaches an include map to the field descriptor", () => {
    const f = single(post).with({ category: true });
    expect(f.kind).toBe("single");
    expect(f.include).toEqual({ category: true });
  });

  it("array().with attaches include too", () => {
    const f = array(post).with({ category: true });
    expect(f.include).toEqual({ category: true });
  });

  it("join carries a nested include for a relation", () => {
    const nested = join(cat, { parent: true });
    expect(nested).toEqual({ kind: "join", model: cat, include: { parent: true } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test model.test -- --run`
Expected: FAIL — `.with`/`.include`/`join` do not exist.

- [ ] **Step 3: Implement include on the field descriptor + `.with` + `join`**

In `packages/rxfy/src/model/model.ts`, extend `FieldDescriptor` and make `single`/`array` return builders:

```ts
export type IncludeMap = Record<string, true | JoinSpec>;
export type JoinSpec = {
  readonly kind: "join";
  readonly model: ModelDescriptor<any, any>;
  readonly include: IncludeMap;
};

export type FieldDescriptor<TShape, TInput = TShape, TInclude extends IncludeMap = Record<never, never>> = {
  readonly _shape?: TShape;
  readonly _input?: (input: TInput) => void;
  readonly kind: "single" | "array";
  readonly model: ModelDescriptor<any, any>;
  /** Which relations this state field joins; drives recursive normalization and the query-shape type. */
  readonly include?: TInclude;
  /** Attach an include map (which relations to join for this fetch). */
  readonly with: <TNext extends IncludeMap>(include: TNext) => FieldDescriptor<TShape, TInput, TNext>;
};

/** Standalone nested include used inside a parent `.with(...)`. */
export function join<TEntity, TKey extends string>(
  model: ModelDescriptor<TEntity, TKey>,
  include: IncludeMap,
): JoinSpec {
  return { kind: "join", model, include };
}

function makeField<TShape, TInput>(
  kind: "single" | "array",
  model: ModelDescriptor<any, any>,
): FieldDescriptor<TShape, TInput> {
  const field = {
    kind,
    model,
    with: <TNext extends IncludeMap>(include: TNext) =>
      ({ ...field, include }) as unknown as FieldDescriptor<TShape, TInput, TNext>,
  } as FieldDescriptor<TShape, TInput>;
  return field;
}
```

Replace `array` and `single`:

```ts
export function array<TEntity, TKey extends string, TInput = TEntity>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): FieldDescriptor<TEntity[], TInput[]> {
  return makeField<TEntity[], TInput[]>("array", model);
}

export function single<TEntity, TKey extends string, TInput = TEntity>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
): FieldDescriptor<TEntity, TInput> {
  return makeField<TEntity, TInput>("single", model);
}
```

`isFieldDescriptor` stays (it checks `kind`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test model.test -- --run` → PASS.
Run: `pnpm --filter rxfy test -- --run` → PASS (existing `array`/`single` tests still hold; `.model`/`.kind` unchanged).
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model.ts packages/rxfy/src/model/model.test.ts
git commit -m "feat(rxfy): add .with builder and join for per-state includes"
```

---

### Task 7: Thread includes into the query-shape type

**Files:**

- Modify: `packages/rxfy/src/state/state.ts` (`QueryShapeFromFields`, add `JoinedView`)
- Test: `packages/rxfy/src/state/state.test.ts`

This task is contract-driven: the type tests below are the specification; the mapped-type implementation is a strong starting point to iterate against `pnpm --filter rxfy check-types`.

- [ ] **Step 1: Write the failing type test**

Add to `packages/rxfy/src/state/state.test.ts`:

```ts
import { ref } from "../model/model.js";

describe("includes shape reads", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "cat7",
  });
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "post7",
  });

  it("joined relation is a readable StoreKey; base has categoryId but no category", () => {
    const joined = { post: single(post).with({ category: true }) };
    const base = { posts: array(post) };

    // Joined: the post view exposes `category` as a Category StoreKey; plain categoryId remains.
    expectTypeOf<QueryShapeFromFields<typeof joined>["post"]>().toEqualTypeOf<
      StoreKey<{ id: string; title: string; categoryId: string; category: StoreKey<{ id: string; name: string }> }>
    >();

    // Base: no `.with`, so the entity view omits the `category` relation field entirely.
    expectTypeOf<QueryShapeFromFields<typeof base>["posts"]>().toEqualTypeOf<
      StoreKey<{ id: string; title: string; categoryId: string }>[]
    >();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test state.test -- --run`
Expected: FAIL — the current mapping ignores relations/includes; base view still contains `category`.

- [ ] **Step 3: Implement the include-aware view mapping**

In `packages/rxfy/src/state/state.ts`, add helper types and use them in `QueryShapeFromFields`. Import the relation/include types:

```ts
import type { EntityKey, FieldDescriptor, IncludeMap, JoinSpec, ModelDescriptor, StoreKey } from "../model/model.js";
```

Add:

```ts
// `ref()` fields infer as `StoreKey<R> | undefined` and `refArray()` as `StoreKey<R>[] | undefined`,
// so relation detection strips the `| undefined` with NonNullable before matching.
type IsRelation<V> =
  NonNullable<V> extends StoreKey<any> ? true : NonNullable<V> extends StoreKey<any>[] ? true : false;

/** Non-relation fields of an entity (plain columns like id, title, categoryId). */
type OmitRelations<TEntity> = {
  [K in keyof TEntity as IsRelation<TEntity[K]> extends true ? never : K]: TEntity[K];
};

/**
 * The joined relations named in an include map, each re-typed as a StoreKey of its own (recursively
 * joined) view. Relations not in the include map are absent here — and OmitRelations dropped them too,
 * so the un-joined relation is omitted from the final view entirely.
 */
type JoinedRelations<TEntity, TInclude extends IncludeMap> = {
  [K in keyof TInclude & keyof TEntity]: NonNullable<TEntity[K]> extends StoreKey<infer R>
    ? TInclude[K] extends JoinSpec
      ? StoreKey<EntityView<R, TInclude[K]["include"]>>
      : StoreKey<OmitRelations<R>>
    : NonNullable<TEntity[K]> extends StoreKey<infer R>[]
      ? TInclude[K] extends JoinSpec
        ? StoreKey<EntityView<R, TInclude[K]["include"]>>[]
        : StoreKey<OmitRelations<R>>[]
      : never;
};

/** A model entity as seen through an include map: non-relations + joined relations; un-joined dropped. */
export type EntityView<TEntity, TInclude extends IncludeMap> = OmitRelations<TEntity> &
  JoinedRelations<TEntity, TInclude>;
```

Then update `QueryShapeFromFields` to apply the view per field:

```ts
export type QueryShapeFromFields<T extends FieldsMap> = {
  [K in keyof T]: T[K] extends FieldDescriptor<infer S, any, infer Inc>
    ? S extends readonly (infer Item)[]
      ? StoreKey<EntityView<Item, Inc>>[]
      : StoreKey<EntityView<S, Inc>>
    : T[K] extends z.ZodType<infer O, any>
      ? O
      : never;
};
```

> Notes for the implementer:
>
> - Relation detection is structural: `IsRelation<V>` strips `| undefined` with `NonNullable` and matches `StoreKey<R>` / `StoreKey<R>[]`. It works because `ref()`'s output type is `StoreKey<R> | undefined`, so `z.infer` of the model schema yields `category: StoreKey<Category> | undefined`.
> - `S`/`Item` here is the model entity type (from `FieldDescriptor<_shape>`), i.e. `z.infer<schema>` including relation fields.
> - `EntityView` recurses via `JoinedRelations`, so `IsRelation`/`OmitRelations`/`JoinedRelations`/`EntityView` are mutually referential — declare them together.
> - Iterate the mapped types against the Step-1 type test until `toEqualTypeOf` passes exactly. The test is the contract; the code above is the starting point.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test state.test -- --run` → PASS.
Run: `pnpm --filter rxfy check-types` → PASS. Fix any existing shape assertions that now differ (relation fields dropped from base views).

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/state.ts packages/rxfy/src/state/state.test.ts
git commit -m "feat(rxfy): thread per-state includes into query-shape types"
```

---

## Phase 4 — Recursive normalization (`writeEntity`)

### Task 8: `writeEntity` — recursive extract, always-replace

**Files:**

- Modify: `packages/rxfy/src/state/normalize.ts`
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/state/normalize.test.ts`:

```ts
import { ref } from "../model/model.js";
import { writeEntity } from "./normalize.js";

describe("writeEntity", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "wcat",
  });
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "wpost",
  });

  it("with an include, extracts the joined entity into its store and stores the id on the parent", () => {
    const reg = createModelRegistry();
    const key = writeEntity(
      reg,
      post,
      { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News" } },
      { category: true },
    );
    expect(key).toBe("p1");
    expect(reg.model(cat).getValue("c1")).toEqual({ id: "c1", name: "News" });
    expect(reg.model(post).getValue("p1")).toEqual({ id: "p1", title: "T", categoryId: "c1", category: "c1" });
  });

  it("without an include, leaves a raw id reference and does not touch the child store", () => {
    const reg = createModelRegistry();
    writeEntity(reg, post, { id: "p2", title: "T2", categoryId: "c9" }, undefined);
    expect(reg.model(post).getValue("p2")).toEqual({ id: "p2", title: "T2", categoryId: "c9" });
    expect(reg.model(cat).getValue("c9")).toBeUndefined();
  });

  it("always replaces an existing entity (latest wins)", () => {
    const reg = createModelRegistry();
    writeEntity(reg, post, { id: "p3", title: "old", categoryId: "c1" }, undefined);
    writeEntity(reg, post, { id: "p3", title: "new", categoryId: "c2" }, undefined);
    expect(reg.model(post).getValue("p3")).toEqual({ id: "p3", title: "new", categoryId: "c2" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test normalize.test -- --run`
Expected: FAIL — `writeEntity` not exported.

- [ ] **Step 3: Implement `writeEntity`**

Add to `packages/rxfy/src/state/normalize.ts`:

```ts
import type { AnyModelDescriptor } from "../model/model-store.js";
import type { IncludeMap, JoinSpec } from "../model/model.js";

/**
 * Write one entity to its store, recursively extracting joined relations. For each relation the
 * `include` marks as joined, the payload carries the full child entity: recurse it into its own store
 * (honoring nested includes) and replace the field on the parent with the child's id. Relations the
 * include does not mention are left as whatever the payload holds (an id string, or absent). The
 * parent is validated against its schema then written with `set` — always replace. Returns the key.
 */
export function writeEntity(
  registry: IModelRegistry,
  descriptor: AnyModelDescriptor,
  raw: unknown,
  include: IncludeMap | undefined,
): string {
  const source = raw as Record<string, unknown>;
  const shaped: Record<string, unknown> = { ...source };

  for (const [field, meta] of Object.entries(descriptor.relations)) {
    const joinSpec = include?.[field];
    if (!joinSpec) continue; // not joined for this fetch — leave the field as-is (id or absent)
    const nestedInclude = typeof joinSpec === "object" ? (joinSpec as JoinSpec).include : undefined;
    const value = source[field];
    if (meta.kind === "array") {
      shaped[field] = (value as unknown[]).map((el) => writeEntity(registry, meta.model, el, nestedInclude));
    } else {
      shaped[field] = writeEntity(registry, meta.model, value, nestedInclude);
    }
  }

  const parsed = process.env.NODE_ENV === "production" ? shaped : descriptor.schema.parse(shaped);
  const key = descriptor.getKey(parsed as never);
  registry.model(descriptor).set(key, parsed);
  return key;
}
```

> The relation field on the parent is set to the child's id (a string). `descriptor.schema.parse` validates it because `ref()`'s runtime schema is a `z.custom(v => typeof v === "string")`. In production, parsing is skipped (mirrors `devParse`); the raw shaped object is written.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test normalize.test -- --run` → PASS.
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "feat(rxfy): add recursive writeEntity normalizer (always-replace)"
```

---

### Task 9: Route `normalizeResult` through `writeEntity`

**Files:**

- Modify: `packages/rxfy/src/state/normalize.ts` (`normalizeResult`)
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/state/normalize.test.ts`:

```ts
describe("normalizeResult with joined relations", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "nrcat",
  });
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "nrpost",
  });

  it("extracts nested joined entities via the field's include", () => {
    const reg = createModelRegistry();
    const fields = { post: single(post).with({ category: true }) };
    const ids = normalizeResult(reg, fields, {
      post: { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News" } },
    } as never);
    expect(ids).toEqual({ post: "p1" });
    expect(reg.model(cat).getValue("c1")).toEqual({ id: "c1", name: "News" });
    expect(reg.model(post).getValue("p1")).toEqual({ id: "p1", title: "T", categoryId: "c1", category: "c1" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test normalize.test -- --run`
Expected: FAIL — `normalizeResult` currently calls `entry.model.schema.parse` + `store.set` directly and ignores `include`, so the nested `category` object is stored verbatim on the post and `cat` store stays empty.

- [ ] **Step 3: Route entity fields through `writeEntity`**

In `packages/rxfy/src/state/normalize.ts`, update `normalizeResult`'s entity branch to call `writeEntity` (plain zod fields unchanged):

```ts
export function normalizeResult<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  value: TShape,
): QueryShapeOf<TShape> {
  const ids: Record<string, unknown> = {};
  for (const [fieldName, entry] of Object.entries(fields)) {
    const fieldValue = (value as Record<string, unknown>)[fieldName];
    if (!isFieldDescriptor(entry)) {
      ids[fieldName] = devParse(entry, fieldValue, fieldName);
      continue;
    }
    if (entry.kind === "array") {
      ids[fieldName] = (fieldValue as unknown[]).map((item) => writeEntity(registry, entry.model, item, entry.include));
    } else {
      ids[fieldName] = writeEntity(registry, entry.model, fieldValue, entry.include);
    }
  }
  return ids as QueryShapeOf<TShape>;
}
```

`entry.model.getKey` / `store.setMany` in the old body are replaced by `writeEntity`'s internal `getKey` + `set`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test normalize.test -- --run` → PASS.
Run: `pnpm --filter rxfy test -- --run` → PASS (the original `normalizeResult` test with plain post/user fields still holds — no relations, `include` undefined, behavior identical).
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "refactor(rxfy): route normalizeResult through writeEntity"
```

---

### Task 10: Recurse `normalizeWritable`/`toEntityId` for setRaw

**Files:**

- Modify: `packages/rxfy/src/state/normalize.ts` (`toEntityId` / `normalizeWritable`)
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/state/normalize.test.ts`:

```ts
describe("normalizeWritable with relations", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "nwcat",
  });
  const post = createModel({
    schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
    getKey: (p) => p.id,
    name: "nwpost",
  });

  it("normalizes a denormalized entity with a joined relation, extracting the child", () => {
    const reg = createModelRegistry();
    const fields = { post: single(post).with({ category: true }) };
    const ids = normalizeWritable(reg, fields, {
      post: { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News" } },
    } as never);
    expect(ids).toEqual({ post: "p1" });
    expect(reg.model(cat).getValue("c1")).toEqual({ id: "c1", name: "News" });
  });

  it("passes an id-string element through unchanged (already normalized)", () => {
    const reg = createModelRegistry();
    const fields = { post: single(post) };
    const ids = normalizeWritable(reg, fields, { post: "p9" } as never);
    expect(ids).toEqual({ post: "p9" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test normalize.test -- --run`
Expected: FAIL — `toEntityId` writes the object without recursing relations, so `cat` store stays empty.

- [ ] **Step 3: Make `toEntityId` recurse via `writeEntity`**

In `packages/rxfy/src/state/normalize.ts`, rewrite `toEntityId` to accept the include and recurse, and thread `entry.include` through `normalizeWritable`:

```ts
/** Resolve one model-field element to its id: strings pass through; objects go through writeEntity. */
function toEntityId(
  registry: IModelRegistry,
  model: AnyModelDescriptor,
  el: unknown,
  include: IncludeMap | undefined,
): string {
  if (typeof el === "string") return el; // already an id
  return writeEntity(registry, model, el, include);
}
```

Update `normalizeWritable`'s entity branches to pass `registry`, `entry.model`, and `entry.include`:

```ts
if (entry.kind === "array") {
  ids[fieldName] = (fieldValue as unknown[]).map((el) => toEntityId(registry, entry.model, el, entry.include));
} else {
  ids[fieldName] = toEntityId(registry, entry.model, fieldValue, entry.include);
}
```

The old `store` local and inline `safeParse` in `toEntityId` are removed (validation now lives in `writeEntity`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test normalize.test -- --run` → PASS.
Run: `pnpm --filter rxfy test -- --run` → PASS (existing `normalizeWritable` tests: string passthrough unchanged; object write now via `writeEntity` with `include === undefined` → same result as before for relation-free models).
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "refactor(rxfy): recurse relations in normalizeWritable/toEntityId"
```

---

## Phase 5 — Reactive optional read (rxfy-react)

### Task 11: `ModelStore.observe` — non-throwing reactive read

**Files:**

- Modify: `packages/rxfy/src/model/model-store.ts` (`ModelStore` type + `createModelStore`)
- Test: `packages/rxfy/src/model/model-store.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/model/model-store.test.ts`:

```ts
describe("observe", () => {
  const m = createModel({ schema: z.object({ id: z.string(), n: z.number() }), getKey: (x) => x.id, name: "obs" });

  it("emits undefined for an absent key, then the entity once it arrives, then updates", () => {
    const reg = createModelRegistry(m);
    const store = reg.model(m);
    const seen: (unknown | undefined)[] = [];
    const sub = store.observe("k").subscribe((v) => seen.push(v));
    store.set("k", { id: "k", n: 1 });
    store.set("k", { id: "k", n: 2 });
    sub.unsubscribe();
    expect(seen).toEqual([undefined, { id: "k", n: 1 }, { id: "k", n: 2 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test model-store.test -- --run`
Expected: FAIL — `observe` not defined.

- [ ] **Step 3: Implement `observe`**

In `packages/rxfy/src/model/model-store.ts`, add to the `ModelStore<TEntity>` type:

```ts
/** Non-throwing reactive read: emits `undefined` until the key is present, then the entity and its updates. */
observe: (key: string) => Observable<TEntity | undefined>;
```

In `createModelStore`, add the implementation to the returned object (uses `cells` and `added` already in scope):

```ts
    observe: (key) =>
      new Observable<TEntity | undefined>((subscriber) => {
        let inner: { unsubscribe: () => void } | undefined;
        const attach = (): boolean => {
          const cell = cells.get(key);
          if (!cell) return false;
          inner = cell.subscribe(subscriber);
          return true;
        };
        if (attach()) return () => inner?.unsubscribe();
        subscriber.next(undefined);
        const waiting = added.subscribe((k) => {
          if (k === key && attach()) waiting.unsubscribe();
        });
        return () => {
          inner?.unsubscribe();
          waiting.unsubscribe();
        };
      }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test model-store.test -- --run` → PASS.
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model-store.ts packages/rxfy/src/model/model-store.test.ts
git commit -m "feat(rxfy): add ModelStore.observe non-throwing reactive read"
```

---

### Task 12: `useModelStoreValue` hook

**Files:**

- Create: `packages/rxfy-react/src/useModelStoreValue.ts`
- Modify: `packages/rxfy-react/src/index.tsx` (export)
- Test: `packages/rxfy-react/src/useModelStoreValue.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-react/src/useModelStoreValue.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { createModel, createModelRegistry, type StoreKey } from "rxfy";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStoreValue } from "./useModelStoreValue.js";

const cat = createModel({
  schema: z.object({ id: z.string(), name: z.string() }),
  getKey: (c) => c.id,
  name: "uv-cat",
});

function Name({ id }: { id: StoreKey<{ id: string; name: string }> | null }) {
  const c = useModelStoreValue(cat, id);
  return <span>{c ? c.name : "—"}</span>;
}

it("renders a fallback when absent and the value once present", () => {
  const registry = createModelRegistry(cat);
  registry.model(cat).set("c1", { id: "c1", name: "News" });
  render(
    <StoreProvider registry={registry}>
      <Name id={"c1" as StoreKey<{ id: string; name: string }>} />
      <Name id={null} />
    </StoreProvider>,
  );
  expect(screen.getByText("News")).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
});
```

> Check `StoreProvider`'s actual prop name in `packages/rxfy-react/src/StoreProvider.tsx` and match it (it may be `registry` or `value`). Adjust the import/props accordingly before running.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy-react test useModelStoreValue -- --run`
Expected: FAIL — module `./useModelStoreValue.js` not found.

- [ ] **Step 3: Implement the hook**

Create `packages/rxfy-react/src/useModelStoreValue.ts`:

```ts
import { useMemo } from "react";
import { EMPTY, type Observable } from "rxjs";
import type { AnyModelDescriptor, EntityOfModel, StoreKey } from "rxfy";
import { useModelStore } from "./useModelStore.js";
import { useObservable } from "./useObservable.js";

/**
 * Non-throwing reactive read of a single entity by id. Returns `undefined` while the id is `null`/
 * absent or the entity is not yet loaded, then the entity once present. Use for components that may
 * render whether or not a relation was joined; use `store.get` when the entity is guaranteed loaded.
 */
export function useModelStoreValue<TDescriptor extends AnyModelDescriptor>(
  model: TDescriptor,
  id: StoreKey<EntityOfModel<TDescriptor>> | null | undefined,
): EntityOfModel<TDescriptor> | undefined {
  const store = useModelStore(model);
  const source: Observable<EntityOfModel<TDescriptor> | undefined> = useMemo(
    () => (id == null ? EMPTY : store.observe(id)),
    [store, id],
  );
  return useObservable(source, undefined);
}
```

> Confirm `useObservable`'s signature (`useObservable(source, initial)`) in `packages/rxfy-react/src/useObservable.ts` and adjust the call if it differs. Confirm `AnyModelDescriptor`/`EntityOfModel`/`StoreKey` are exported from `rxfy`'s barrel (`packages/rxfy/src/index.ts`) — if not, add them there in this task.

- [ ] **Step 4: Export the hook**

In `packages/rxfy-react/src/index.tsx`, add:

```ts
export { useModelStoreValue } from "./useModelStoreValue.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter rxfy-react test useModelStoreValue -- --run` → PASS.
Run: `pnpm --filter rxfy-react check-types` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy-react/src/useModelStoreValue.ts packages/rxfy-react/src/useModelStoreValue.test.tsx packages/rxfy-react/src/index.tsx packages/rxfy/src/index.ts
git commit -m "feat(rxfy-react): add useModelStoreValue reactive optional read"
```

---

## Phase 6 — Exports, end-to-end test, changeset

### Task 13: Barrel exports for the new public API

**Files:**

- Modify: `packages/rxfy/src/index.ts`
- Test: `packages/rxfy/src/index.test.ts` (create if absent) or extend an existing smoke test

- [ ] **Step 1: Write the failing test**

Create/append `packages/rxfy/src/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as rxfy from "./index.js";

describe("public API", () => {
  it("exports the new relations surface", () => {
    for (const name of ["ref", "refArray", "join", "asKey", "single", "array", "createModel"]) {
      expect(typeof (rxfy as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test index.test -- --run`
Expected: FAIL — `ref`/`refArray`/`join`/`asKey` not re-exported.

- [ ] **Step 3: Add exports**

In `packages/rxfy/src/index.ts`, ensure these are exported from `./model/model.js` (extend the existing model export line):

```ts
export {
  array,
  asKey,
  createModel,
  join,
  ref,
  refArray,
  single,
  type EntityKey,
  type EntityOfModel,
  type FieldDescriptor,
  type IncludeMap,
  type JoinSpec,
  type ModelDescriptor,
  type RelationMeta,
  type StoreKey,
} from "./model/model.js";
```

(Merge with whatever the file already exports from `./model/model.js`; do not duplicate.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test index.test -- --run` → PASS.
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/index.ts packages/rxfy/src/index.test.ts
git commit -m "feat(rxfy): export relations public API"
```

---

### Task 14: End-to-end test — list vs detail share one store

**Files:**

- Test: `packages/rxfy/src/state/relations.e2e.test.ts` (create)

- [ ] **Step 1: Write the test**

Create `packages/rxfy/src/state/relations.e2e.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, ref, single } from "../model/model.js";
import { createModelRegistry } from "../model/model-store.js";
import { normalizeResult } from "./normalize.js";

const cat = createModel({
  schema: z.object({ id: z.string(), name: z.string() }),
  getKey: (c) => c.id,
  name: "e2e-cat",
});
const post = createModel({
  schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
  getKey: (p) => p.id,
  name: "e2e-post",
});

describe("list and detail feed one shared store", () => {
  it("list stores refs only; detail joins the category into the same post cell", () => {
    const reg = createModelRegistry();

    // LIST fetch — no join. Post carries only categoryId.
    normalizeResult(reg, { posts: array(post) }, {
      posts: [{ id: "p1", title: "A", categoryId: "c1" }],
    } as never);
    expect(reg.model(post).getValue("p1")).toEqual({ id: "p1", title: "A", categoryId: "c1" });
    expect(reg.model(cat).getValue("c1")).toBeUndefined(); // not loaded on the list

    // DETAIL fetch — joins category into the SAME post store.
    normalizeResult(reg, { post: single(post).with({ category: true }) }, {
      post: { id: "p1", title: "A", categoryId: "c1", category: { id: "c1", name: "News" } },
    } as never);
    expect(reg.model(post).getValue("p1")).toEqual({ id: "p1", title: "A", categoryId: "c1", category: "c1" });
    expect(reg.model(cat).getValue("c1")).toEqual({ id: "c1", name: "News" }); // now present
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm --filter rxfy test relations.e2e -- --run`
Expected: PASS (all prior tasks make this green).

- [ ] **Step 3: Full workspace verification**

Run: `pnpm --filter rxfy test -- --run` → PASS.
Run: `pnpm --filter rxfy-react test -- --run` → PASS.
Run: `turbo check-types` → PASS.
Run: `turbo build` → PASS (tsup emits `.d.ts` for the new exports).

- [ ] **Step 4: Commit**

```bash
git add packages/rxfy/src/state/relations.e2e.test.ts
git commit -m "test(rxfy): e2e list/detail share one normalized store"
```

---

### Task 15: Changeset (minor)

**Files:**

- Create: `.changeset/<generated>.md`

- [ ] **Step 1: Write the changeset**

Create a changeset file `.changeset/model-relations.md`:

```md
---
"rxfy": minor
"rxfy-react": minor
---

Add model relations with per-state joins. Declare relation fields in a model schema with `ref()`/`refArray()` and join them per fetch with `single(Model).with({ rel: true })` / `join(Model, {...})`, so list and detail payloads share one normalized store. `ModelStore.get` is now typed to require a framework-minted `StoreKey<T>` (query shapes produce these automatically); pass a genuinely-raw id through `asKey(model, id)`. New `useModelStoreValue(model, id)` gives a non-throwing reactive read for components that may render whether or not a relation was joined.

Migration: this is a type-only tightening of `get`. Ids read from a state's `data$` are already `StoreKey`s and keep working; a raw string passed directly to `get(...)` now needs `get(asKey(Model, id))`.
```

- [ ] **Step 2: Verify changeset status**

Run: `pnpm changeset status`
Expected: lists `rxfy` and `rxfy-react` as minor bumps.

- [ ] **Step 3: Commit**

```bash
git add .changeset/model-relations.md
git commit -m "chore: changeset for model relations (minor)"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** StoreKey+asKey (T1–T3, spec "Type system"), ref/refArray+relation map (T4–T5, "Declaration surface"), `.with`/`join`+type threading (T6–T7, "Per-state joins"), recursive writeEntity always-replace (T8–T10, "Runtime"), useModelStoreValue (T11–T12, "Escape hatch"), Drizzle passthrough is validated implicitly by the payload shapes in T8/T14 (server wiring is Plan B). Settled decisions 1–4 are all reflected (minor semver → T15; `join` naming → T6; relation-only-no-FK allowed → `writeEntity` derives the id via `getKey` even with no sibling FK; top-level fields become `StoreKey` → T3).
- **Follow-ups (Plan B, not this plan):** `sync.serve` parse → `writeEntity`; recurse `collectEntityTopics`/`collectShapeTopics` into joined relations for live-sync topics/`$grant`; verify SSR dehydrate/hydrate of nested joins.
- **Type-level risk:** Tasks 3, 7 are contract-driven — the `expectTypeOf`/`@ts-expect-error` tests are the acceptance criteria; iterate the mapped-type implementations against `pnpm --filter rxfy check-types`.
