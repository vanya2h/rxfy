# setRaw auto-normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `useStateData`'s `setRaw` accept denormalized entity objects (or a mix of ids and entities) in model-field slots and normalize them on write, removing the manual `normalizeResult` boilerplate and the "entity not loaded" footgun.

**Architecture:** Add a `WritableQueryShapeOf<TShape>` type and a standalone `normalizeWritable` helper to the core `rxfy` package; the helper passes string ids through untouched and writes object entities to their model stores (validating in dev). Widen `setRaw`'s value type in `rxfy-react` and route its value through `normalizeWritable`. `set`, `normalizeResult`, SSR, and `reload` are untouched.

**Tech Stack:** TypeScript, RxJS, Zod, Vitest 3.x, tsup, pnpm + Turbo monorepo.

---

## File Structure

- `packages/rxfy/src/state/state.ts` — **modify**: add `WritableQueryShapeOf<TShape>` type beside `QueryShapeOf`.
- `packages/rxfy/src/state/normalize.ts` — **modify**: add `normalizeWritable` export. `normalizeResult`/`denormalizeValue` unchanged.
- `packages/rxfy/src/state/normalize.test.ts` — **modify**: add a `describe("normalizeWritable")` block.
- `packages/rxfy-react/src/useStateData.ts` — **modify**: widen the `setRaw` signature on `StateHandle` and route through `normalizeWritable`.
- `packages/rxfy-react/src/useStateData.test.tsx` — **modify**: add `setRaw`-with-entities integration tests.
- `apps/docs/src/pages/react/use-state-data.mdx` — **modify**: update `setRaw` example, prose, and remove the footgun blockquote.
- `.changeset/*.md` — **create**: one changeset, `minor` for both packages.

---

### Task 1: `WritableQueryShapeOf` type + `normalizeWritable` helper (rxfy)

**Files:**
- Modify: `packages/rxfy/src/state/state.ts` (after `QueryShapeOf`, around line 13)
- Modify: `packages/rxfy/src/state/normalize.ts`
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

Append this block to `packages/rxfy/src/state/normalize.test.ts` (the file already defines `postModel`, `userModel`, `fields`, and `Shape` — reuse them; add the `normalizeWritable` import to the existing import on line 5):

```ts
// change line 5 to:
import { denormalizeValue, normalizeResult, normalizeWritable } from "./normalize.js";
```

```ts
describe("normalizeWritable", () => {
  it("passes string ids through without writing to stores", () => {
    const registry = createModelRegistry();
    const ids = normalizeWritable(registry, fields, { posts: ["1", "2"], author: "u1" });
    expect(ids).toEqual({ posts: ["1", "2"], author: "u1" });
    // nothing was written for those keys
    expect(registry.model(postModel).getValue("1")).toBeUndefined();
    expect(registry.model(userModel).getValue("u1")).toBeUndefined();
  });

  it("writes entity objects to stores and returns their ids", () => {
    const registry = createModelRegistry();
    const ids = normalizeWritable(registry, fields, {
      posts: [
        { id: "1", title: "A" },
        { id: "2", title: "B" },
      ],
      author: { id: "u1", name: "Ann" },
    });
    expect(ids).toEqual({ posts: ["1", "2"], author: "u1" });
    expect(registry.model(postModel).getValue("2")).toEqual({ id: "2", title: "B" });
    expect(registry.model(userModel).getValue("u1")).toEqual({ id: "u1", name: "Ann" });
  });

  it("handles a mix of ids and entities in one array", () => {
    const registry = createModelRegistry();
    const ids = normalizeWritable(registry, fields, {
      posts: ["1", { id: "2", title: "B" }],
      author: "u1",
    });
    expect(ids).toEqual({ posts: ["1", "2"], author: "u1" });
    // only the object element was written
    expect(registry.model(postModel).getValue("2")).toEqual({ id: "2", title: "B" });
    expect(registry.model(postModel).getValue("1")).toBeUndefined();
  });

  it("throws a dev-readable error for a malformed entity", () => {
    const registry = createModelRegistry();
    expect(() =>
      normalizeWritable(registry, fields, {
        posts: [{ id: "1" } as never], // missing `title`
        author: "u1",
      }),
    ).toThrow(/model "post"/);
  });

  it("skips validation when NODE_ENV is production", () => {
    const registry = createModelRegistry();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const ids = normalizeWritable(registry, fields, {
        posts: [{ id: "1" } as never], // malformed, but not validated in prod
        author: "u1",
      });
      expect(ids).toEqual({ posts: ["1"], author: "u1" });
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter rxfy test -- normalize`
Expected: FAIL — `normalizeWritable` is not exported (`TypeError`/import error).

- [ ] **Step 3: Add the `WritableQueryShapeOf` type**

In `packages/rxfy/src/state/state.ts`, add directly below the `QueryShapeOf` type (after line 13):

```ts
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

(`EntityKey` is already imported at the top of `state.ts`.)

- [ ] **Step 4: Add the `normalizeWritable` helper**

In `packages/rxfy/src/state/normalize.ts`, update the imports and append the function. Change the import on line 2 to include `WritableQueryShapeOf`:

```ts
import type { FieldsMap, QueryShapeOf, WritableQueryShapeOf } from "./state.js";
```

Add `ModelDescriptor` to the imports and a per-element helper plus the function at the end of the file:

```ts
import type { ModelDescriptor } from "../model/model.js";
import type { ModelStore } from "../model/model-store.js";

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
 * string elements pass through as ids; object elements are written to their store. Entity objects
 * are schema-validated in development. Used by setRaw so callers can append entities without a
 * manual normalizeResult round-trip.
 */
export function normalizeWritable<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  value: WritableQueryShapeOf<TShape>,
): QueryShapeOf<TShape> {
  const ids: Record<string, unknown> = {};
  for (const [fieldName, desc] of Object.entries(fields)) {
    const store = registry.model(desc.model);
    const fieldValue = (value as Record<string, unknown>)[fieldName];
    if (desc.kind === "array") {
      ids[fieldName] = (fieldValue as unknown[]).map((el) => toEntityId(store, desc.model, el));
    } else {
      ids[fieldName] = toEntityId(store, desc.model, fieldValue);
    }
  }
  return ids as QueryShapeOf<TShape>;
}
```

Note: `registry.model(desc.model)` returns `ModelStore<T>` (exported from `model-store.ts`); `IModelRegistry` is already imported in `normalize.ts`. `toEntityId` only uses `.set`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter rxfy test -- normalize`
Expected: PASS — all `normalizeResult`, `denormalizeValue`, and `normalizeWritable` tests green.

- [ ] **Step 6: Type-check the package**

Run: `pnpm --filter rxfy check-types`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy/src/state/state.ts packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "feat(rxfy): add normalizeWritable and WritableQueryShapeOf"
```

---

### Task 2: Widen `setRaw` to accept entities (rxfy-react)

**Files:**
- Modify: `packages/rxfy-react/src/useStateData.ts` (`StateHandle.setRaw` type ~line 40; `setRaw` impl ~lines 200-208; imports lines 2 & 3-15)
- Test: `packages/rxfy-react/src/useStateData.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

Add this block to `packages/rxfy-react/src/useStateData.test.tsx`. It mirrors the file's existing setup (reuse the existing test models/state if present; otherwise the snippet below is self-contained — place the model/state declarations at module scope near the other test fixtures, and the `it` blocks inside the existing `describe("useStateData")`, adapting names to the file's conventions):

```tsx
// module scope (near other fixtures):
const feedItemModel = createModel(z.object({ id: z.string(), text: z.string() }), {
  getKey: (x) => x.id,
  name: "feed-item",
});
const feedState = defineState({
  key: "feed",
  params: z.object({}),
  model: { items: array(feedItemModel) },
});
const fetchFeed = async () => ({ items: [{ id: "1", text: "one" }] });
```

```tsx
it("setRaw accepts entity objects, writing them to the store and appending ids", async () => {
  const registry = createModelRegistry();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <StoreProvider registry={registry}>{children}</StoreProvider>
  );

  const { result } = renderHook(
    () => useStateData({ state: feedState, fetchFn: fetchFeed, params: {} }),
    { wrapper },
  );

  // wait for the initial fetch to settle (item "1" loaded)
  await waitFor(() => expect(getEmitted(result.current.data$)).toEqual({ items: ["1"] }));

  // append a brand-new entity by object — no normalizeResult call
  act(() => {
    result.current.setRaw((prev) => ({ items: [...prev.items, { id: "2", text: "two" }] }));
  });

  // the id list grew...
  expect(getEmitted(result.current.data$)).toEqual({ items: ["1", "2"] });
  // ...and the entity is now in the store (no "entity not loaded")
  expect(registry.model(feedItemModel).getValue("2")).toEqual({ id: "2", text: "two" });
});

it("setRaw with an id-only value still works unchanged", async () => {
  const registry = createModelRegistry();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <StoreProvider registry={registry}>{children}</StoreProvider>
  );
  const { result } = renderHook(
    () => useStateData({ state: feedState, fetchFn: fetchFeed, params: {} }),
    { wrapper },
  );
  await waitFor(() => expect(getEmitted(result.current.data$)).toEqual({ items: ["1"] }));

  act(() => {
    result.current.setRaw({ items: ["1"] });
  });
  expect(getEmitted(result.current.data$)).toEqual({ items: ["1"] });
});
```

If the test file has no `getEmitted` helper, read the current value off `data$` the same way the existing tests in this file do (e.g. subscribe once and capture, or an existing helper). Match the file's established pattern rather than introducing a new one. Required imports to add if missing: `createModel`, `array`, `defineState`, `createModelRegistry` from `rxfy`; `z` from `zod`; `act`, `renderHook`, `waitFor` from `@testing-library/react`; `StoreProvider` from the package index.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter rxfy-react test -- useStateData`
Expected: FAIL — the entity-object test fails type-check/at runtime because `setRaw`'s value is typed ids-only and the object is not written to the store (read of `"2"` returns `undefined`).

- [ ] **Step 3: Widen the `setRaw` type on `StateHandle`**

In `packages/rxfy-react/src/useStateData.ts`, add `WritableQueryShapeOf` to the type import on line 2:

```ts
import type { Atom, FieldsMap, IWrapped, MutationDefs, QueryShapeOf, StateDescriptor, WritableQueryShapeOf } from "rxfy";
```

Add `normalizeWritable` to the value import (the `from "rxfy"` block, lines 3-15):

```ts
  normalizeResult,
  normalizeWritable,
```

Replace the `setRaw` field on `StateHandle` (around line 33-40) so its value accepts entities while the updater's `prev` stays ids:

```ts
  /**
   * Low-level sibling of `set` that writes the **id shape** directly — no denormalize round-trip.
   * Its value may contain ids, denormalized entities, or a mix in model-field slots: object
   * entities are written to their stores (validated in dev), strings pass through as ids. The
   * updater receives the current ids and must return the writable shape; it is a no-op until the
   * query is FULFILLED. Use for append / prepend / reorder / dedup where re-normalizing the whole
   * list (`set`) would be O(N).
   */
  readonly setRaw: (
    ids:
      | WritableQueryShapeOf<TShape>
      | ((prev: QueryShapeOf<TShape>) => WritableQueryShapeOf<TShape>),
  ) => void;
```

- [ ] **Step 4: Route `setRaw` through `normalizeWritable`**

Replace the `setRaw` implementation (around lines 200-208):

```ts
    const setRaw = (
      idsOrUpdater:
        | WritableQueryShapeOf<TShape>
        | ((prev: QueryShapeOf<TShape>) => WritableQueryShapeOf<TShape>),
    ) => {
      if (typeof idsOrUpdater === "function") {
        const current = atom$.get();
        if (current.type !== StatusEnum.FULFILLED) return;
        writeThrough(normalizeWritable(registry, fields, idsOrUpdater(current.value)));
      } else {
        writeThrough(normalizeWritable(registry, fields, idsOrUpdater));
      }
    };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter rxfy-react test -- useStateData`
Expected: PASS — both new tests and all existing `useStateData` tests green.

- [ ] **Step 6: Type-check the package**

Run: `pnpm --filter rxfy-react check-types`
Expected: no errors. (`rxfy` must be built first — run `pnpm --filter rxfy build` if the type import isn't resolved.)

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy-react/src/useStateData.ts packages/rxfy-react/src/useStateData.test.tsx
git commit -m "feat(rxfy-react): setRaw accepts denormalized entities"
```

---

### Task 3: Changeset

**Files:**
- Create: `.changeset/setraw-auto-normalize.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/setraw-auto-normalize.md`:

```markdown
---
"rxfy": minor
"rxfy-react": minor
---

`useStateData`'s `setRaw` now accepts denormalized entity objects (or a mix of ids and entities) in
model-field slots and normalizes them on write — appending a page no longer needs a manual
`normalizeResult` call. Adds the `normalizeWritable` helper and `WritableQueryShapeOf` type to `rxfy`.
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/setraw-auto-normalize.md
git commit -m "chore: changeset for setRaw auto-normalization"
```

---

### Task 4: Docs

**Files:**
- Modify: `apps/docs/src/pages/react/use-state-data.mdx`

- [ ] **Step 1: Simplify the `useAppendPage` example**

Replace the `useAppendPage` code block (the `import { useModelRegistry } ...` example, lines ~136-152) with:

````md
```tsx
import { feedState } from "./feed";

function useAppendPage() {
  const { setRaw } = useStateData({ state: feedState, fetchFn: fetchFirst, params });

  // pass new entities by object — setRaw writes them to the store and appends their ids
  return (page: { items: FeedItem[] }) => setRaw((prev) => ({ items: [...prev.items, ...page.items] }));
}
```
````

- [ ] **Step 2: Update the surrounding prose**

In the paragraph above the example (starting "Because `setRaw` never touches the model stores..."), replace it with:

```md
`setRaw` accepts the **normalized id shape**, but each model-field slot may also hold full entity
objects (or a mix): object elements are written to their model stores for you, strings pass through
as ids. The updater form receives the current **ids** (no denormalize round-trip), so appending a
page stays O(page size) — only the new entities are written. Use `setRaw` whenever re-normalizing the
whole list with `set` would be wasteful: appending a page, prepending, reordering, de-duplicating, or
optimistically removing a row.
```

- [ ] **Step 3: Remove the footgun blockquote**

Delete the bottom blockquote that begins `> `setRaw` writes ids that may not have matching entities in the store yet.` (lines ~158-160) and replace it with:

```md
> Passing entities to `setRaw` costs O(objects passed) — only the objects are normalized, ids are
> free. Passing the **entire** list as objects is equivalent to `set`; reach for that instead when
> you genuinely intend to rewrite every row.
```

- [ ] **Step 4: Update the `set` / `setRaw` signature comment block**

In the `set vs setRaw` section's `ts` block (around lines 125-128), update the `setRaw` comment to reflect the wider input:

```ts
set:    (value: Updater<TShape>) => void;                       // full entities
setRaw: (ids:   Updater<WritableQueryShapeOf<TShape>>) => void; // ids and/or entities
// Updater<T> = T | ((prev: T) => T)  — note: setRaw's updater receives prev as ids (QueryShapeOf)
```

- [ ] **Step 5: Verify the docs build (or render check)**

Run: `pnpm --filter docs build` (if the docs app builds in CI) — Expected: success.
If no docs build is wired, visually confirm the MDX edits in `apps/docs/src/pages/react/use-state-data.mdx` are well-formed (fenced code blocks balanced).

- [ ] **Step 6: Commit**

```bash
git add apps/docs/src/pages/react/use-state-data.mdx
git commit -m "docs: setRaw accepts denormalized entities"
```

---

## Self-Review

**Spec coverage:**
- Type change (§1) → Task 1 Step 3 (`WritableQueryShapeOf`) + Task 2 Step 3 (`setRaw` signature). ✓
- Tolerant normalize (§2) → Task 1 Step 4 (`normalizeWritable`, `typeof` branch, dev `safeParse`). ✓
- Wiring (§3) → Task 2 Step 4. ✓
- Edge cases → covered by Task 1 tests (empty/all-ids, mixed, single object, dev throw, prod skip) and Task 2 test (updater append, id-only regression). ✓
- Testing → Tasks 1 & 2. ✓
- Docs → Task 4. ✓
- Changeset (minor/minor) → Task 3. ✓

**Type consistency:** `WritableQueryShapeOf<TShape>` is defined once in `state.ts` and referenced identically in `normalize.ts`, `useStateData.ts` (both the `StateHandle` type and the impl). `normalizeWritable(registry, fields, value)` signature matches all call sites. `toEntityId` is internal to `normalize.ts`. The `setRaw` updater `prev` is `QueryShapeOf<TShape>` everywhere; the value/return is `WritableQueryShapeOf<TShape>` everywhere.

**Verified during planning:** `registry.model(...)` returns `ModelStore<T>` (used in `toEntityId`); `WritableQueryShapeOf` lives in `state.ts`; `normalizeWritable` is exported via `state/normalize.js` (re-exported from the package index by the existing `export * from "./state/normalize.js"`).
