# setRaw auto-normalization — design

**Date:** 2026-06-16
**Packages:** `rxfy`, `rxfy-react`
**Status:** Approved (design), pending implementation plan

## Problem

`useStateData`'s `setRaw` writes the normalized **id shape** directly. To append a page of
new entities, the caller must first normalize them into the model stores themselves:

```tsx
import { useModelRegistry } from "rxfy-react";
import { normalizeResult } from "rxfy";

function useAppendPage() {
  const registry = useModelRegistry();
  const { setRaw } = useStateData({ state: feedState, fetchFn: fetchFirst, params });

  return (page: { items: FeedItem[] }) => {
    const { items: newIds } = normalizeResult(registry, feedState.fields, { items: page.items });
    setRaw((prev) => ({ items: [...prev.items, ...newIds] }));
  };
}
```

This is boilerplate (`useModelRegistry` + `normalizeResult`) and a footgun: forget the
normalize step and components reading the appended ids throw "entity not loaded".

`set` already accepts denormalized entities, but its updater **denormalizes `prev` into full
entities** (`denormalizeValue`), an O(N) rebuild of the entire existing list — which is the very
cost `setRaw` exists to avoid. The two methods differ by their updater's `prev` type (ids vs full
entities), not by their input value type.

## Goal

Let `setRaw`'s **value** carry full entity objects (or a mix of ids and entities) in model-field
slots and normalize them on the way in — while keeping its updater's `prev` as ids (cheap) and the
write O(page-size). Removes the boilerplate and the footgun.

## Non-goals

- No change to `set`, `defaultData`, SSR, or `reload`.
- No merging of `set` and `setRaw` into one method.
- No support for non-string entity keys (`EntityKey<T> extends string` already holds).

## Design

### 1. Type change (rxfy-react)

`setRaw`'s value type widens; its updater `prev` stays ids.

```ts
// before
setRaw: (ids: Updater<QueryShapeOf<TShape>>) => void;
// after
setRaw: (ids: Updater<WritableQueryShapeOf<TShape>>) => void;
//   where the updater form is: (prev: QueryShapeOf<TShape>) => WritableQueryShapeOf<TShape>
```

`WritableQueryShapeOf<TShape>` maps each model field to its id **or** its entity:

- `single(model)` field → `string | Entity`
- `array(model)` field → `(string | Entity)[]`
- non-model fields → unchanged

`QueryShapeOf<TShape>` is a subtype of `WritableQueryShapeOf<TShape>`, so every existing
`setRaw(ids)` call type-checks unchanged and behaves identically at runtime (strings pass through).

**Backward compatible → `minor`.**

### 2. Tolerant normalize (rxfy)

New exported helper beside `normalizeResult` in `packages/rxfy/src/state/normalize.ts`:

```ts
/** Like normalizeResult, but tolerates already-normalized ids mixed with denormalized entities. */
export function normalizeWritable<TShape>(
  registry: IModelRegistry,
  fields: FieldsMap,
  value: WritableQueryShapeOf<TShape>,
): QueryShapeOf<TShape>;
```

Per field, per element:

- `typeof el === "string"` → an id; pass through unchanged (no store write, no `getKey`). O(1).
- otherwise → an entity; in dev (`process.env.NODE_ENV !== "production"`) run
  `desc.model.schema.safeParse(el)` and throw a clear `rxfy: ...` error on failure, then
  `store.set(desc.model.getKey(el), el)` and use that key.

Detection by `typeof` is O(1) per element and unambiguous: an id is always a `string`, an entity is
always an object. `safeParse` runs **only** on the objects being normalized (O(page-size)), never on
existing ids — it is validation, not the branch condition.

`normalizeResult` stays strict and untouched (its `setMany` batch path is unchanged).
`normalizeWritable` is a standalone sibling: it writes entity elements individually via `store.set`
because an id-vs-entity mix rules out `setMany`'s all-objects batch. The dev error message mirrors
the existing denormalize error style (`rxfy: ... model "<name>" ...`).

### 3. Wiring (rxfy-react)

`setRaw` in `useStateData.ts` routes its value — both the direct and updater-return forms — through
`normalizeWritable(registry, fields, …)` before `writeThrough`. The early `return` when not
`FULFILLED` (updater form) is unchanged. Store population now happens in the same write tick, so the
"entity not loaded" footgun cannot occur.

## Edge cases

- **Empty / all-ids arrays** → pure passthrough; identical to today.
- **Updater before FULFILLED** → still a no-op (early return preserved).
- **Malformed object** → dev: throws from `safeParse`; prod: written as-is (validation skipped),
  same risk profile as `set` today.
- **Object in a `single` model field** → normalized via `getKey`, same rule as the array case.

## Testing (TDD — tests first)

**rxfy — `normalizeWritable` unit tests:**
- all-ids passthrough (no store writes)
- all-entities (written + ids returned)
- mixed `[id, entity]` array
- `single`-field object
- dev `safeParse` throws on malformed entity
- prod skips validation

**rxfy-react — `useStateData` integration:**
- append via `setRaw((prev) => ({ items: [...prev.items, ...entities] }))` writes entities to the
  store and appends their ids, with no `normalizeResult` call
- a `useModelStore` read of an appended id resolves without "entity not loaded"

**Regression:** existing id-only `setRaw` tests unchanged.

## Docs (apps/docs/src/pages/react/use-state-data.mdx)

- Rewrite the `useAppendPage` example to the one-liner (drop `useModelRegistry` + `normalizeResult`).
- Update `setRaw` prose and the `set` vs `setRaw` table: `setRaw` accepts ids **or** entities and
  normalizes objects itself.
- Remove the bottom "populate stores before `setRaw`" footgun blockquote.
- Add a short note: passing entities costs O(objects passed); passing the whole list as objects is
  just `set`.

## Changeset

- `rxfy`: `minor` — new `normalizeWritable` export.
- `rxfy-react`: `minor` — `setRaw` value type widened to accept entities.
