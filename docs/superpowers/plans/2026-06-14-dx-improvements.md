# rxfy DX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `useEntity`/`useEntity$`/`useStateEntities` hooks, a reactive `denormalizeShape$` core helper, an `entity()` loaded-contract guard, an optional `equals` comparator on `createLens`, and the missing docs (error handling, testing, runnable quickstart).

**Architecture:** Denormalization logic lives in core (`rxfy`, pure + RxJS, unit-testable without React); React hooks (`rxfy-react`) are thin wire-ups over existing machinery (`useModelStore`, `usePending`, `denormalizeShape$`). The `entity()` guard and `createLens` `equals` are small, backwards-compatible core changes. Spec: `docs/superpowers/specs/2026-06-14-dx-improvements-design.md`.

**Tech Stack:** TypeScript, RxJS 7, lodash, Zod, React 19, Vitest 3, @testing-library/react, tsup, Turbo, pnpm.

---

## Conventions

- Run tests for a single core package from repo root: `pnpm --filter rxfy test`
- Run tests for the React package: `pnpm --filter rxfy-react test`
- Run a single test file: `pnpm --filter rxfy exec vitest run src/state/normalize.test.ts`
- Prettier: 120 print width, double quotes, semicolons, trailing commas.
- Imports inside packages use the `.js` extension (ESM), e.g. `import { x } from "./foo.js"`.
- Commit messages: plain conventional-commit style, **no Co-Authored-By trailer**.

## File Structure

- Create: `packages/rxfy-react/src/useEntity.ts` — `useEntity` + `useEntity$` hooks.
- Create: `packages/rxfy-react/src/useEntity.test.tsx` — tests for both hooks.
- Create: `packages/rxfy-react/src/useStateEntities.ts` — `useStateEntities` hook.
- Create: `packages/rxfy-react/src/useStateEntities.test.tsx` — tests.
- Modify: `packages/rxfy/src/state/normalize.ts` — add `denormalizeShape$`.
- Modify: `packages/rxfy/src/state/normalize.test.ts` — add `denormalizeShape$` tests.
- Modify: `packages/rxfy/src/model/model-store.ts` — `entity()` guard + doc comment.
- Modify: `packages/rxfy/src/model/model-store.test.ts` — guard test.
- Modify: `packages/rxfy/src/lens/lens.ts` — `equals` option.
- Modify: `packages/rxfy/src/lens/lens.test.ts` — `equals` test.
- Modify: `packages/rxfy-react/src/index.tsx` — export new hooks.
- Create: `apps/docs/src/pages/guides/error-handling.mdx`, `apps/docs/src/pages/guides/testing.mdx`.
- Modify: `apps/docs/src/pages/getting-started.mdx`, `react.mdx`, `models-state.mdx`, `core-concepts/lens.mdx`, `apps/docs/vocs.config.ts`.
- Create: `.changeset/dx-improvements.md`.

---

## Task 1: `denormalizeShape$` core helper

**Files:**

- Modify: `packages/rxfy/src/state/normalize.ts`
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/rxfy/src/state/normalize.test.ts` (the file already imports `array`, `createModel`, `single`, `createModelRegistry`, `z`, and defines `postModel`, `userModel`, `fields`, `Shape`, `value`):

```ts
import { isSyncMarked } from "../ssr/sync-marker.js";
import { denormalizeShape$ } from "./normalize.js";
import { BehaviorSubject } from "rxjs";

describe("denormalizeShape$", () => {
  it("reassembles the denormalized shape from ids (single + array)", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, fields, value);
    const ids$ = new BehaviorSubject(ids);
    const seen: Shape[] = [];
    const sub = denormalizeShape$<Shape>(registry, fields, ids$).subscribe((v) => seen.push(v));
    expect(seen.at(-1)).toEqual(value);
    sub.unsubscribe();
  });

  it("re-emits when an individual entity changes (no id change)", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, fields, value);
    const ids$ = new BehaviorSubject(ids);
    const seen: Shape[] = [];
    const sub = denormalizeShape$<Shape>(registry, fields, ids$).subscribe((v) => seen.push(v));
    registry.model(postModel).set("1", { id: "1", title: "A-edited" });
    expect(seen.at(-1)!.posts[0]).toEqual({ id: "1", title: "A-edited" });
    sub.unsubscribe();
  });

  it("re-emits when the id shape changes", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, fields, value);
    const ids$ = new BehaviorSubject(ids);
    const seen: Shape[] = [];
    const sub = denormalizeShape$<Shape>(registry, fields, ids$).subscribe((v) => seen.push(v));
    registry.model(postModel).set("3", { id: "3", title: "C" });
    ids$.next({ ...ids, posts: ["1", "2", "3"] });
    expect(seen.at(-1)!.posts.map((p) => p.id)).toEqual(["1", "2", "3"]);
    sub.unsubscribe();
  });

  it("emits an empty array for an empty array field", () => {
    const registry = createModelRegistry();
    const emptyFields = { posts: array(postModel) };
    type EmptyShape = { posts: { id: string; title: string }[] };
    const ids$ = new BehaviorSubject({ posts: [] as string[] });
    const seen: EmptyShape[] = [];
    const sub = denormalizeShape$<EmptyShape>(registry, emptyFields, ids$).subscribe((v) => seen.push(v));
    expect(seen.at(-1)).toEqual({ posts: [] });
    sub.unsubscribe();
  });

  it("is sync-marked and emits synchronously when all entities are present", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, fields, value);
    const ids$ = new BehaviorSubject(ids);
    const shape$ = denormalizeShape$<Shape>(registry, fields, ids$);
    expect(isSyncMarked(shape$)).toBe(true);
    let emittedSync = false;
    const sub = shape$.subscribe(() => (emittedSync = true));
    expect(emittedSync).toBe(true);
    sub.unsubscribe();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter rxfy exec vitest run src/state/normalize.test.ts`
Expected: FAIL — `denormalizeShape$ is not a function` / import not found.

- [ ] **Step 3: Implement `denormalizeShape$`**

In `packages/rxfy/src/state/normalize.ts`, add imports at the top and the function at the bottom:

```ts
import { combineLatest, map, Observable, of, switchMap } from "rxjs";
import { markSync } from "../ssr/sync-marker.js";
import type { IModelRegistry } from "../model/model-store.js";
import type { FieldsMap, QueryShapeOf } from "./state.js";
```

(The first two `import type` lines for `IModelRegistry` and `FieldsMap`/`QueryShapeOf` already exist — keep a single copy; only add the `rxjs` and `markSync` imports.)

```ts
/**
 * Reactive denormalization: given a stream of query ids, emit the rebuilt fetch shape, staying
 * live to both id changes (switchMap re-subscribes) and individual entity field updates
 * (combineLatest over each entity cell). Output is sync-marked so a hydrated/cache-hit shape
 * emits synchronously and usePending shows no pending flash.
 */
export function denormalizeShape$<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  ids$: Observable<QueryShapeOf<TShape>>,
): Observable<TShape> {
  const fieldEntries = Object.entries(fields);
  return markSync(
    ids$.pipe(
      switchMap((ids) => {
        if (fieldEntries.length === 0) return of({} as TShape);
        const idsRecord = ids as Record<string, unknown>;
        const fieldStreams = fieldEntries.map(([name, desc]) => {
          const store = registry.model(desc.model);
          if (desc.kind === "array") {
            const keys = idsRecord[name] as string[];
            const items$ = keys.length ? combineLatest(keys.map((key) => store.get(key))) : of([] as unknown[]);
            return items$.pipe(map((items) => [name, items] as const));
          }
          const key = idsRecord[name] as string;
          return store.get(key).pipe(map((item) => [name, item] as const));
        });
        return combineLatest(fieldStreams).pipe(map((pairs) => Object.fromEntries(pairs) as TShape));
      }),
    ),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter rxfy exec vitest run src/state/normalize.test.ts`
Expected: PASS (all denormalizeShape$ tests + existing normalize tests).

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "feat(rxfy): add denormalizeShape\$ reactive denormalization helper"
```

---

## Task 2: `entity()` loaded-contract guard

**Files:**

- Modify: `packages/rxfy/src/model/model-store.ts:14-27` (doc comment) and `:82-86` (entity impl)
- Test: `packages/rxfy/src/model/model-store.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe` block that contains the `entity` tests in `packages/rxfy/src/model/model-store.test.ts` (the one using the `Post` model with `name: "post-entity-test"`, near line 200):

```ts
it("throws a descriptive error when read before the entity is loaded", () => {
  const store = createModelStore(Post);
  expect(() => store.entity("missing")).toThrow(/not loaded/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/model/model-store.test.ts`
Expected: FAIL — `store.entity("missing")` currently returns a lens (no throw).

- [ ] **Step 3: Implement the guard**

In `packages/rxfy/src/model/model-store.ts`, replace the `entity` implementation (currently lines 82-86):

```ts
    entity: (key) =>
      createLens<T | undefined, T>(getCell(key as string), {
        get: (source) => {
          if (source === undefined) {
            throw new Error(
              `rxfy: entity "${key}" for model "${descriptor.name ?? "<unnamed>"}" is not loaded — ` +
                `guard with <Pending>/useEntity or seed it first`,
            );
          }
          return source;
        },
        set: (current) => current,
      }),
```

Then update the doc comment on the `entity` field in the `ModelStore<T>` type (currently lines 16-19) to:

```ts
/**
 * Writable handle over a single entity's cell — for field Lenses and form binding.
 * Assumes the entity is already loaded: reading it before its first `set` throws. For
 * not-yet-loaded entities use `get(key)` / `useEntity`, or seed the entity first.
 */
entity: (key: EntityKey<T>) => IAtom<T>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter rxfy exec vitest run src/model/model-store.test.ts`
Expected: PASS — new guard test passes; existing entity tests (which `set` before `entity`) still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model-store.ts packages/rxfy/src/model/model-store.test.ts
git commit -m "feat(rxfy): throw on entity() read before load instead of silent undefined"
```

---

## Task 3: `equals` option on `createLens`

**Files:**

- Modify: `packages/rxfy/src/lens/lens.ts`
- Test: `packages/rxfy/src/lens/lens.test.ts`

- [ ] **Step 1: Write the failing test**

Append a new `describe` to `packages/rxfy/src/lens/lens.test.ts` (it already imports `createAtom`, `createLens`, `ILens`):

```ts
describe("createLens equals option", () => {
  it("suppresses emissions deemed equal by a custom comparator", () => {
    const root$ = createAtom({ items: [1, 2, 3] });
    const itemsLens: ILens<{ items: number[] }, number[]> = {
      get: (s) => s.items,
      set: (v, s) => ({ ...s, items: v }),
    };
    const lens$ = createLens(root$, itemsLens, { equals: (a, b) => a.length === b.length });
    const seen: number[][] = [];
    const sub = lens$.subscribe((v) => seen.push(v));
    expect(seen).toHaveLength(1); // initial

    root$.set({ items: [4, 5, 6] }); // same length → suppressed
    expect(seen).toHaveLength(1);

    root$.set({ items: [7] }); // different length → emits
    expect(seen).toHaveLength(2);
    expect(seen.at(-1)).toEqual([7]);
    sub.unsubscribe();
  });

  it("defaults to deep equality when no comparator is given", () => {
    const root$ = createAtom({ items: [1, 2, 3] });
    const itemsLens: ILens<{ items: number[] }, number[]> = {
      get: (s) => s.items,
      set: (v, s) => ({ ...s, items: v }),
    };
    const lens$ = createLens(root$, itemsLens);
    const seen: number[][] = [];
    const sub = lens$.subscribe((v) => seen.push(v));
    root$.set({ items: [1, 2, 3] }); // deep-equal → suppressed
    expect(seen).toHaveLength(1);
    root$.set({ items: [1, 2, 4] }); // different → emits
    expect(seen).toHaveLength(2);
    sub.unsubscribe();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy exec vitest run src/lens/lens.test.ts`
Expected: FAIL — `createLens` does not accept a third argument; the custom-comparator test does not suppress.

- [ ] **Step 3: Implement the `equals` option**

In `packages/rxfy/src/lens/lens.ts`:

Add a private field declaration after `private lens: ILens<TSource, TTarget>;`:

```ts
  private equals: (a: TTarget, b: TTarget) => boolean;
```

Change the constructor signature and add the local `equals`:

```ts
  constructor(
    source$: IAtom<TSource>,
    lens: ILens<TSource, TTarget>,
    opts?: { equals?: (a: TTarget, b: TTarget) => boolean },
  ) {
    const initialValue = lens.get(source$.get());
    const subject$ = new BehaviorSubject<TTarget>(initialValue);
    const equals = opts?.equals ?? _.isEqual;
```

Inside the `super(...)` callback, replace `distinctUntilChanged(_.isEqual)` with `distinctUntilChanged(equals)` and the `tap` guard `if (!_.isEqual(prev, x))` with `if (!equals(prev, x))`.

At the end of the constructor, after `this.lens = lens;`, add:

```ts
this.equals = equals;
```

Leave the `set` method's write-back guard (`if (!_.isEqual(updated, sourceVal))`) **unchanged** — it compares `TSource`, not `TTarget`.

Update `createLens` to forward `opts`:

```ts
export function createLens<TSource, TTarget>(
  source$: IAtom<TSource>,
  lens: ILens<TSource, TTarget>,
  opts?: { equals?: (a: TTarget, b: TTarget) => boolean },
) {
  return new Lens(source$, lens, opts);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter rxfy exec vitest run src/lens/lens.test.ts`
Expected: PASS — new equals tests plus all existing lens tests.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/lens/lens.ts packages/rxfy/src/lens/lens.test.ts
git commit -m "feat(rxfy): add optional equals comparator to createLens"
```

---

## Task 4: `useEntity` / `useEntity$` hooks

**Files:**

- Create: `packages/rxfy-react/src/useEntity.ts`
- Test: `packages/rxfy-react/src/useEntity.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/rxfy-react/src/useEntity.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { createModel, createModelRegistry, StatusEnum } from "rxfy";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { ModelRegistryContext } from "./registry-context.js";
import { useEntity, useEntity$ } from "./useEntity.js";

const Todo = createModel(z.object({ id: z.string(), title: z.string() }), {
  getKey: (t) => t.id,
  name: "todo",
});

function wrapperFor(registry: ReturnType<typeof createModelRegistry>) {
  return ({ children }: { children: React.ReactNode }) => (
    <ModelRegistryContext.Provider value={registry}>{children}</ModelRegistryContext.Provider>
  );
}

describe("useEntity", () => {
  it("is fulfilled synchronously for a pre-seeded (hydrated) entity", () => {
    const registry = createModelRegistry();
    registry.model(Todo).set("t1", { id: "t1", title: "Hello" });
    const { result } = renderHook(() => useEntity(Todo, "t1"), { wrapper: wrapperFor(registry) });
    expect(result.current).toEqual({ type: StatusEnum.FULFILLED, value: { id: "t1", title: "Hello" } });
  });

  it("starts pending for an unloaded entity, then fulfills when set", () => {
    const registry = createModelRegistry();
    const { result, rerender } = renderHook(() => useEntity(Todo, "t2"), { wrapper: wrapperFor(registry) });
    expect(result.current.type).toBe(StatusEnum.PENDING);
    act(() => registry.model(Todo).set("t2", { id: "t2", title: "Later" }));
    rerender();
    expect(result.current).toEqual({ type: StatusEnum.FULFILLED, value: { id: "t2", title: "Later" } });
  });
});

describe("useEntity$", () => {
  it("returns a stable observable that emits the entity", () => {
    const registry = createModelRegistry();
    registry.model(Todo).set("t1", { id: "t1", title: "Hello" });
    const { result } = renderHook(() => useEntity$(Todo, "t1"), { wrapper: wrapperFor(registry) });
    const seen: { id: string; title: string }[] = [];
    const sub = result.current.subscribe((v) => seen.push(v));
    expect(seen).toEqual([{ id: "t1", title: "Hello" }]);
    sub.unsubscribe();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter rxfy-react exec vitest run src/useEntity.test.tsx`
Expected: FAIL — `./useEntity.js` does not exist.

- [ ] **Step 3: Implement the hooks**

Create `packages/rxfy-react/src/useEntity.ts`:

```ts
import { useMemo } from "react";
import type { EntityKey, IWrapped, ModelDescriptor, StatusEnum } from "rxfy";
import type { Observable } from "rxjs";
import { useModelStore } from "./useModelStore.js";
import { usePending } from "./usePending.js";

/** Stable memoized observable over a single entity — slot into `<Pending value$={...}>`. */
export function useEntity$<T>(model: ModelDescriptor<T>, id: EntityKey<T>): Observable<T> {
  const store = useModelStore(model);
  return useMemo(() => store.get(id), [store, id]);
}

/**
 * Status of a single entity (PENDING until first loaded, then FULFILLED). Never REJECTED —
 * an entity stream has no error state; query errors surface on the StateHandle's data$.
 */
export function useEntity<T>(
  model: ModelDescriptor<T>,
  id: EntityKey<T>,
): IWrapped<T, StatusEnum.PENDING | StatusEnum.FULFILLED> {
  return usePending(useEntity$(model, id)) as IWrapped<T, StatusEnum.PENDING | StatusEnum.FULFILLED>;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter rxfy-react exec vitest run src/useEntity.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/useEntity.ts packages/rxfy-react/src/useEntity.test.tsx
git commit -m "feat(rxfy-react): add useEntity and useEntity\$ hooks"
```

---

## Task 5: `useStateEntities` hook

**Files:**

- Create: `packages/rxfy-react/src/useStateEntities.ts`
- Test: `packages/rxfy-react/src/useStateEntities.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/rxfy-react/src/useStateEntities.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import { array, createModel, defineState, single } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStore } from "./useModelStore.js";
import { useStateData } from "./useStateData.js";
import { useStateEntities } from "./useStateEntities.js";

const postModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "post" });
const userModel = createModel(z.object({ id: z.string(), name: z.string() }), { getKey: (x) => x.id, name: "user" });

const detailState = defineState({
  key: "detail",
  params: z.object({ id: z.string() }),
  model: { posts: array(postModel), author: single(userModel) },
});

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("useStateEntities", () => {
  it("emits the fully denormalized shape", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [
        { id: "1", title: "A" },
        { id: "2", title: "B" },
      ],
      author: { id: "u1", name: "Ann" },
    });
    const { result } = renderHook(
      () => {
        const handle = useStateData(detailState, fetchFn, { id: "x" });
        return useStateEntities(detailState, handle);
      },
      { wrapper },
    );

    const shape = await firstValueFrom(result.current);
    expect(shape).toEqual({
      posts: [
        { id: "1", title: "A" },
        { id: "2", title: "B" },
      ],
      author: { id: "u1", name: "Ann" },
    });
  });

  it("reflects an entity edit without an id change", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [{ id: "1", title: "A" }],
      author: { id: "u1", name: "Ann" },
    });
    const { result } = renderHook(
      () => {
        const store = useModelStore(postModel);
        const handle = useStateData(detailState, fetchFn, { id: "y" });
        const entities$ = useStateEntities(detailState, handle);
        return { store, entities$ };
      },
      { wrapper },
    );

    await firstValueFrom(result.current.entities$);
    const seen: string[] = [];
    const sub = result.current.entities$.subscribe((s) =>
      seen.push((s as { posts: { title: string }[] }).posts[0].title),
    );
    act(() => result.current.store.set("1", { id: "1", title: "A-edited" }));
    expect(seen.at(-1)).toBe("A-edited");
    sub.unsubscribe();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter rxfy-react exec vitest run src/useStateEntities.test.tsx`
Expected: FAIL — `./useStateEntities.js` does not exist.

- [ ] **Step 3: Implement the hook**

Create `packages/rxfy-react/src/useStateEntities.ts`:

```ts
import { useMemo } from "react";
import { denormalizeShape$, type FieldsMap, type MutationDefs, type StateDescriptor } from "rxfy";
import type { Observable } from "rxjs";
import { useModelRegistry } from "./registry-context.js";
import type { StateHandle } from "./useStateData.js";

/**
 * Denormalized view of a StateHandle: the full fetch shape (TShape inferred from `state`),
 * live to both id changes and individual entity updates. Render with `<Pending value$={...}>`.
 */
export function useStateEntities<TParams, TShape, TMutations extends MutationDefs<TShape>>(
  state: StateDescriptor<TParams, TShape, TMutations>,
  handle: StateHandle<TShape, TMutations>,
): Observable<TShape> {
  const registry = useModelRegistry();
  return useMemo(
    () => denormalizeShape$<TShape>(registry, state.fields as FieldsMap, handle.data$),
    [registry, state, handle],
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter rxfy-react exec vitest run src/useStateEntities.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-react/src/useStateEntities.ts packages/rxfy-react/src/useStateEntities.test.tsx
git commit -m "feat(rxfy-react): add useStateEntities denormalized stream hook"
```

---

## Task 6: Export new hooks + changeset

**Files:**

- Modify: `packages/rxfy-react/src/index.tsx`
- Create: `.changeset/dx-improvements.md`

- [ ] **Step 1: Add exports**

In `packages/rxfy-react/src/index.tsx`, add (keeping alphabetical-ish grouping with the other `use*` exports):

```ts
export { useEntity, useEntity$ } from "./useEntity.js";
export { useStateEntities } from "./useStateEntities.js";
```

- [ ] **Step 2: Verify the React package builds and type-checks**

Run: `pnpm --filter rxfy build && pnpm --filter rxfy-react check-types`
Expected: PASS — no type errors; `denormalizeShape$` resolves from the freshly built `rxfy`.

(Note: `rxfy` must be rebuilt first so `rxfy-react` sees `denormalizeShape$` in `dist`.)

- [ ] **Step 3: Create the changeset**

Create `.changeset/dx-improvements.md`:

```md
---
"rxfy": minor
"rxfy-react": minor
---

DX improvements:

- **rxfy-react:** `useEntity` / `useEntity$` (single-entity hooks) and `useStateEntities`
  (denormalized, live state shape — no hand-written id types, no manual `combineLatest`).
- **rxfy:** `denormalizeShape$` reactive denormalization helper.
- **rxfy:** `createLens` accepts an optional `equals` comparator (defaults to deep equality).
- **rxfy:** `entity()` now throws a descriptive error when read before the entity is loaded,
  instead of silently returning `undefined` typed as `T`. Correct (post-load) usage is unchanged.
```

- [ ] **Step 4: Commit**

```bash
git add packages/rxfy-react/src/index.tsx .changeset/dx-improvements.md
git commit -m "feat(rxfy-react): export useEntity/useEntity\$/useStateEntities; add changeset"
```

---

## Task 7: Docs — quickstart, error handling, testing, touch-ups

**Files:**

- Modify: `apps/docs/src/pages/getting-started.mdx`
- Create: `apps/docs/src/pages/guides/error-handling.mdx`
- Create: `apps/docs/src/pages/guides/testing.mdx`
- Modify: `apps/docs/src/pages/react.mdx`, `apps/docs/src/pages/models-state.mdx`, `apps/docs/src/pages/core-concepts/lens.mdx`
- Modify: `apps/docs/vocs.config.ts`

- [ ] **Step 1: Add the runnable quickstart to getting-started**

In `apps/docs/src/pages/getting-started.mdx`, insert a new section between the "Wrap your app" section and "## Next steps":

````md
## Your first state

Define a model, declare a state, and read it in a component. This is a complete, runnable example.

```tsx
import { createModel, defineState, array } from "rxfy";
import { useStateData, useStateEntities, Pending } from "rxfy-react";
import { z } from "zod";

// 1. Model — an entity type + how to read its id.
const todoModel = createModel(z.object({ id: z.string(), title: z.string(), done: z.boolean() }), {
  getKey: (t) => t.id,
  name: "todo",
});

// 2. State — a normalized, typed query shape.
const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
});

// 3. Fetcher — returns the denormalized shape.
async function fetchTodos(_params: object, signal: AbortSignal) {
  const res = await fetch("/api/todos", { signal });
  return { todos: (await res.json()) as { id: string; title: string; done: boolean }[] };
}

// 4. Component — useStateEntities gives the full shape, inferred. No manual id wiring.
export function Todos() {
  const handle = useStateData(todosState, fetchTodos, {});
  const todos$ = useStateEntities(todosState, handle);
  return (
    <Pending value$={todos$} pending={<p>Loading…</p>} rejected={() => <p>Failed to load.</p>}>
      {({ todos }) => (
        <ul>
          {todos.map((t) => (
            <li key={t.id}>{t.title}</li>
          ))}
        </ul>
      )}
    </Pending>
  );
}
```

Prefer working with one entity at a time (e.g. a row component)? Use `useEntity`:

```tsx
import { useEntity } from "rxfy-react";
import { StatusEnum } from "rxfy";

function TodoRow({ id }: { id: string }) {
  const todo = useEntity(todoModel, id);
  if (todo.type === StatusEnum.PENDING) return <li>…</li>;
  return <li>{todo.value.title}</li>;
}
```
````

- [ ] **Step 2: Create the error-handling guide**

Create `apps/docs/src/pages/guides/error-handling.mdx`:

````md
# Error handling

rxfy models async state with a four-state union — `IDLE`, `PENDING`, `FULFILLED`, `REJECTED`
(see [Wrapped](/core-concepts/wrapped)). This page covers how those states surface and how to
handle failures.

## Rendering errors with `<Pending>`

`<Pending>` renders the right branch for each state. Pass `rejected` to handle a failed fetch:

```tsx
<Pending value$={data$} pending={<Spinner />} rejected={(w) => <p>Something went wrong: {String(w.error)}</p>}>
  {(data) => <List data={data} />}
</Pending>
```

When no `rejected` is given, `<Pending>` renders nothing for the error branch and logs the error
to the console.

## Retrying a failed fetch

`useStateData` returns a `reload()` that clears the cached query and refetches:

```tsx
const { data$, reload } = useStateData(state, fetchFn, params);

<Pending value$={data$} rejected={() => <button onClick={reload}>Retry</button>}>
  {(data) => <List data={data} />}
</Pending>;
```

## `REJECTED` is only the initial fetch

A `REJECTED` state is only ever the terminal state of the **initial** fetch. Once a state is
`FULFILLED`, later writes (`set`, mutations) keep it `FULFILLED` — they never move it back to
`REJECTED`. Handle mutation failures yourself at the call site (see below).

## Async event handlers

Event handlers that call async APIs should not be passed an async function directly (React's
types reject a returned Promise). Wrap the call and handle rejection explicitly:

```tsx
const onSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  void saveTodo(form).catch((err) => setError(err));
};
```

## `entity()` must be loaded

`store.entity(key)` is for an entity that is already loaded (form binding). Reading it before its
first `set` throws a descriptive error. For an entity that may still be loading, use `get(key)` or
`useEntity`, which stay `PENDING` until the entity arrives.
````

- [ ] **Step 3: Create the testing guide**

Create `apps/docs/src/pages/guides/testing.mdx`:

````md
# Testing

rxfy state is plain RxJS over an in-memory registry, so tests need no special harness — create a
registry, seed it, and render under the provider.

## Seed a registry directly

```tsx
import { createModelRegistry } from "rxfy";
import { ModelRegistryContext } from "rxfy-react";

const registry = createModelRegistry();
registry.model(todoModel).set("t1", { id: "t1", title: "Hello", done: false });

render(
  <ModelRegistryContext.Provider value={registry}>
    <TodoRow id="t1" />
  </ModelRegistryContext.Provider>,
);
```

A component reading `useEntity(todoModel, "t1")` is `FULFILLED` synchronously on first render —
no waiting, no act warnings.

## Mock a fetcher

`useStateData` takes the fetcher as an argument, so pass a stub:

```tsx
const fetchTodos = vi.fn().mockResolvedValue({ todos: [{ id: "t1", title: "Hi", done: false }] });

const { result } = renderHook(() => useStateData(todosState, fetchTodos, {}), {
  wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
});

const data = await firstValueFrom(result.current.data$);
expect(data.todos).toEqual(["t1"]);
```

## Assert denormalized output

```tsx
const todos$ = renderHook(
  () => {
    const handle = useStateData(todosState, fetchTodos, {});
    return useStateEntities(todosState, handle);
  },
  { wrapper },
).result.current;

expect((await firstValueFrom(todos$)).todos[0].title).toBe("Hi");
```
````

- [ ] **Step 4: Document the new hooks in react.mdx**

In `apps/docs/src/pages/react.mdx`, add a section documenting the three hooks. Place it near the
existing `useModelStore` / `useStateData` documentation:

````md
## `useEntity` / `useEntity$`

Read a single entity by id without wiring the store and `useMemo` by hand.

```tsx
// status object — switch on type
const todo = useEntity(todoModel, id); // IWrapped<T, PENDING | FULFILLED>

// observable — for <Pending>
const todo$ = useEntity$(todoModel, id); // Observable<T>
<Pending value$={todo$}>{(t) => <span>{t.title}</span>}</Pending>;
```

`useEntity` is never `REJECTED` — an entity stream has no error state. A query's failure surfaces
on its `StateHandle.data$`.

## `useStateEntities`

Turn a `StateHandle` (which carries entity **ids**) into the fully denormalized fetch shape, with
`TShape` inferred from the state — no hand-written id types, no manual `combineLatest`.

```tsx
const handle = useStateData(detailState, fetchDetail, { id });
const detail$ = useStateEntities(detailState, handle); // Observable<{ post, author, comments }>

<Pending value$={detail$}>{({ post, author }) => <Article post={post} author={author} />}</Pending>;
```

The stream stays live to both id changes (add / remove / reorder) and individual entity edits.
````

- [ ] **Step 5: Note the entity() contract in models-state.mdx and the equals option in lens.mdx**

In `apps/docs/src/pages/models-state.mdx`, where `entity()` / the model store is described, add:

```md
> `store.entity(key)` assumes the entity is already loaded — it is meant for form binding on a
> fetched entity. Reading it before load throws; use `store.get(key)` or `useEntity` for entities
> that may still be loading.
```

In `apps/docs/src/pages/core-concepts/lens.mdx`, add near the `createLens` signature:

````md
### Custom equality

`createLens` deduplicates emissions with deep equality (`lodash.isEqual`) by default. For large
values or hot update paths, pass a cheaper comparator:

```ts
const items$ = createLens(source$, itemsLens, { equals: (a, b) => a.length === b.length });
```
````

- [ ] **Step 6: Add the guides to the sidebar**

In `apps/docs/vocs.config.ts`, replace the `Guides` items array so it reads:

```ts
    {
      text: "Guides",
      items: [
        { text: "Error handling", link: "/guides/error-handling" },
        { text: "Testing", link: "/guides/testing" },
        { text: "Live updates over WebSockets", link: "/guides/live-updates-websockets" },
      ],
    },
```

- [ ] **Step 7: Verify docs build**

Run: `pnpm --filter docs build`
Expected: PASS — the new pages compile and the sidebar links resolve. (If the docs package has no `build` script or it is slow, instead confirm the files exist and the config parses: `pnpm --filter docs exec tsc --noEmit -p .` is not required — a successful `vocs build` is the check.)

- [ ] **Step 8: Commit**

```bash
git add apps/docs
git commit -m "docs: add quickstart, error-handling + testing guides, document new hooks"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Build, test, lint, type-check the whole workspace**

Run: `turbo build && turbo test && turbo lint && turbo check-types`
Expected: PASS for all packages. The new tests (`normalize.test.ts`, `model-store.test.ts`,
`lens.test.ts`, `useEntity.test.tsx`, `useStateEntities.test.tsx`) all pass; no lint or type errors.

- [ ] **Step 2: If anything fails, fix it and re-run**

Address failures in the relevant task's files, re-run the failing command until green. Do not
proceed past a red build.

- [ ] **Step 3: Final commit (only if Step 2 required changes)**

```bash
git add -A
git commit -m "chore: fixups from full workspace verification"
```

---

## Self-Review Notes

- **Spec coverage:** item 1 → Task 4; item 2 → Tasks 1 (core) + 5 (hook); item 4 → Task 7; item 6 → Task 2; item 8 → Task 3. Exports + changeset → Task 6. Verification → Task 8.
- **Type consistency:** `denormalizeShape$<TShape>(registry, fields, ids$)` is defined in Task 1 and consumed with the same signature in Task 5. `useEntity`/`useEntity$`/`useStateEntities` names match between implementation (Tasks 4–5), exports (Task 6), and docs (Task 7).
- **Backwards compatibility:** all changes additive except the `entity()` guard (Task 2), which is called out in the changeset (Task 6).
