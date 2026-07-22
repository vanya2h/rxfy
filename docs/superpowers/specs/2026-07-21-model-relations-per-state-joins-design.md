# Model relations with per-state joins

**Date:** 2026-07-21
**Status:** Approved — all decisions settled; ready for implementation plan
**Packages:** `rxfy` (core), `rxfy-react` (reads), `rxfy-server` (`sync.serve`)

## Problem

An entity often appears in two shapes depending on the endpoint that returned it:

- In a **list** (`GET /posts`) each post carries only a **reference** to its category — an id. The list never renders category details, and often is not authorized to fetch them.
- On a **detail page** (`GET /posts/:id`) the same post carries the **joined** category object, because that page renders `category.name`.

Today rxfy normalizes only at the **state** level: `defineState({ model })` fields are `array(Model)`/`single(Model)`, and [`normalizeResult`](../../../packages/rxfy/src/state/normalize.ts) splits a **full** top-level entity into a store, leaving its id in the query shape. A model's own schema is a flat, opaque zod object — there is no notion of a relation _inside_ an entity, and no way to say a field is "sometimes an id, sometimes the joined entity."

The consequence: to model the list-vs-detail split you must declare **two `Post` models → two stores** for the same entity. Dedup and shared reactivity break — a single `store.set` no longer updates every view of that post.

### The core tension

rxfy's foundational invariant is _"every id in a query shape resolves to an entity in the store."_ It holds today because the only way an id enters a query shape is `normalizeResult` splitting a full entity into the store. A relation that can arrive id-only is the first way to get an **id with no backing entity** — a **dangling reference**. `useModelStore(Category).get(id)` would throw.

We resolve this not with a runtime resolver but with **static typing**: the list page must not even be _able to write_ the resolve that would throw.

## Goals

1. **One model, one store per entity.** The list payload and the detail payload feed the same `Post` store; the same `Category` object dedups into one `Category` store.
2. **Relations declared once, in the model schema** — a structural fact about the domain.
3. **Joins declared per-state** — each fetch decides which relations it delivers joined, mirroring the endpoint's authorization and payload.
4. **Compile-time safety.** A relation that a state did **not** join is _absent_ from that state's query-shape type. You cannot reference it, so you cannot resolve an unloaded entity. A joined relation is a framework-minted `StoreKey<T>` that `store.get` accepts, while `get` **rejects arbitrary strings** — so no id from outside a query shape (nor the raw FK) can reach the store without an explicit `asKey`.
5. **Zero-reshape server integration.** A Drizzle relational query result drops straight into `sync.serve` with no massaging; rxfy's `.with({ … })` mirrors Drizzle's `with: { … }`.

## Non-goals / rejected

- **No auto-loading resolver.** Reading an unresolved reference must never trigger a fetch. Auto-fetch would make endpoints page-agnostic and break per-page/per-state authorization. (Explicitly rejected by the design owner.)
- **No merge-on-write.** Entity writes **always replace** — latest payload is authoritative. Predictable last-write-wins; a state that returns a partial entity is responsible for returning what it needs.
- **Runtime id-or-entity polymorphism is not the model.** Each endpoint returns one fixed, typed shape; different states return different shapes. The variation is chosen per-state at compile time, not discovered at runtime.

## Design overview: two layers

**Relations are structural — declared in the model schema, once.** `Post.category → Category` is true everywhere. The **stored** `Post` always holds the relation as a normalized id; the joined object is consumed into the `Category` store and discarded.

**Joins are per-state — declared on the fetch via `.with()`.** The join config drives both:

- **Runtime:** the normalizer expects and extracts the joined entity into its store for included relations; leaves everything else alone.
- **Compile-time:** an included relation appears in the query shape as a `StoreKey<Category>` (resolvable via `get`); an un-included relation is **absent from the query-shape type entirely**.

## Declaration surface

The user declares **two fields** — matching Drizzle's own column + relation split:

```ts
const Category = createModel({ schema: categorySchema, getKey: (c) => c.id, name: "category" });

const Post = createModel({
  schema: z.object({
    id: z.string(),
    title: z.string(),
    categoryId: z.string(), // plain FK — always present, for when you only need the id
    category: ref(Category), // the relation — resolvable only when a state joins it
  }),
  getKey: (p) => p.id,
  name: "post",
});
```

- **`categoryId`** is a **plain value field** (bare zod schema — the existing passthrough path in `normalizeResult`). It is always in the query shape. Use it when you only need the id, e.g. `` `/categories/${post.categoryId}` ``. It never touches the store.
- **`category`** is `ref(Category)` — the resolvable handle. Its presence in the query shape is gated by `.with()`.

`refArray(Tag)` is the array analogue for to-many relations.

### `ref()` / `refArray()`

`ref(model)` returns a zod schema tagged as a relation. It is used two ways:

1. **As a marker.** `createModel` walks the schema's `.shape` and, for each field tagged as a relation, records `{ fieldName → { model, kind: "single" | "array" } }` into a **relation map** stored on the descriptor (new `ModelDescriptor.relations` field).
2. **As a type carrier.** Its inferred output is the entity id; the query-shape layer brands it as `StoreKey<TEntity>` (see Type system). Its input accepts the model's input (the joined object) so a joined payload type-checks. The relation's presence in a state's query shape is gated by `.with()` (see below).

**zod 4** makes the walk clean: the relation metadata is attached via a dedicated `z.registry()` (no mutation of schema internals, no `.def` spelunking). `.shape` on a `ZodObject` is stable public API.

**Constraint (fail-fast):** relation fields must be **direct properties of a top-level `ZodObject`**. If the model schema is wrapped so `.shape` is not reachable (a pipe, a discriminated union), `createModel` throws at declaration time with a clear message rather than silently missing a relation. Benign top-level wrappers (`.brand()`, a single `.refine()`) are unwrapped.

## Per-state joins: `.with()`

`single(model)` / `array(model)` gain a `.with(include)` builder. `include` is a map over the model's declared relations:

```ts
const postState = defineState({
  key: "post",
  params: z.object({ id: z.string() }),
  model: { post: single(Post).with({ category: true }) }, // ← join category
});

const postsState = defineState({
  key: "posts",
  params: z.object({}),
  model: { posts: array(Post) }, // ← no join
});
```

Nested joins compose (`category` → its own `parent`):

```ts
single(Post).with({ category: join(Category, { parent: true }) });
```

`join(model, include)` is the standalone form used inside a parent `.with(...)` to attach a nested include to a relation. (`single(...).with(...)` is sugar for the top-level include; `join(...)` carries a nested one.)

### Effect on the query-shape type

`.with()` transforms the field's entry in `QueryShapeFromFields`:

- **`single(Post).with({ category: true })`** → `{ …, categoryId: string, category: StoreKey<Category> }`
- **`array(Post)`** (no `.with`) → `{ …, categoryId: string }` — **no `category` key at all**

The un-joined case omits the relation field from the type, so on the list page `post.category` is a compile error. This is the maximal static-safety form (goal 4).

### Effect on the payload (input) type

`.with()` also transforms `InputShapeFromFields`: an included relation **requires** the full nested entity in the wire payload; an un-included relation must **not** be present (or is ignored). This lines up with Drizzle's inferred return type for `findMany({ with })`.

## Type system — one framework-minted key brand (`StoreKey`)

To statically forbid `get(<arbitrary string>)`, `get`'s parameter must be a type a plain `string` is **not** assignable to — i.e. a brand. We introduce exactly **one** phantom brand, `StoreKey<T>`, and it is minted by the **query-shape layer**, not by the user and not per join-state:

```ts
type StoreKey<TEntity> = EntityKey<TEntity> & { readonly __store: (e: TEntity) => void }; // phantom (required brand)
get: (key: StoreKey<TEntity>) => IAtom<TEntity>; // was: EntityKey<TEntity>
```

`QueryShapeFromFields` produces `StoreKey<T>` for **every** entity id — top-level (`state.post`) **and** joined relation (`post.category`) alike.

> This is a different brand than the earlier, rejected `Ref`/`LoadedRef`. Those encoded a two-level _loaded-vs-unloaded_ distinction that absence-gating already handles. `StoreKey` is orthogonal and single-level: it only means _"a key the framework minted for a store,"_ so arbitrary strings can't reach `get`.

### Effects

- `get(state.post)` and `get(post.category)` compile — query-shape ids are already `StoreKey`.
- `get("literal")` and `get(post.categoryId)` (a plain `string`) are **type errors** — arbitrary ids are rejected. This closes the raw-FK bypass **unconditionally**, with no dependency on the user branding their id field.
- Cross-model misuse `postStore.get(categoryKey)` is a type error (bonus — today it throws only at runtime).
- `StoreKey<T>` is still `string & brand`, so `` `/posts/${id}` ``, `key={id}`, `String(id)` are unaffected.

### Backward compatibility

- Every id sourced from `data$`/`useStateData` (the sanctioned invariant-#1 path) is `StoreKey` → **all existing `get(...)` calls compile unchanged.**
- `getValue`, `set`, `setMany`, hydration, and the writable `setRaw` path keep accepting raw `string` — writes/seeds unaffected.
- Runtime is **identical** (phantom brand) — a **type-only** change.

### Entry point for genuinely-raw ids

```ts
function asKey<M>(model: M, id: string): StoreKey<EntityOf<M>>;
get(asKey(Category, routeParams.id)); // e.g. a URL param
```

`asKey` replaces the old implicit `get(rawString)` with an explicit assertion — the one sanctioned way to enter the keyspace from an unbranded id.

### Static safety for relations comes from **absence** _and_ the brand

- **Joined** relation → query shape carries `category: StoreKey<Category>` — resolvable via `get`.
- **Un-joined** relation → the field is **omitted from the query-shape type**, so `post.category` is a compile error on the list page.
- The raw `categoryId` plain field remains a `string`, and `get` now rejects `string` — so even a present FK can't be resolved without `asKey`.

### Escape hatch — components polymorphic over join-state

A component reused on both pages (a `<PostCard>` shown in the list _and_ on the detail page) cannot assume the relation is loaded. It declares the field as **`StoreKey<Category> | null`** (present-or-absent reference) and reads it through the **non-throwing** path — never `get`:

- New reactive optional read that returns `Category | undefined` and re-renders if the entity later arrives — e.g. a `useModelStoreValue(model, id)` hook (reactive counterpart of the existing non-reactive `getValue`). It accepts `StoreKey<T> | null | undefined` and yields `undefined` when absent or not yet loaded.

`| null` only expresses _"there may be no reference,"_ not _"the id is present but unloaded"_ — that distinction is carried by **which read function you call** (`get` for guaranteed-loaded, `useModelStoreValue` for maybe-loaded), not by the id's type.

## Runtime: recursive normalization

All entity writes route through one recursive function — call it `writeEntity(registry, descriptor, raw, include)`:

1. For each relation in `descriptor.relations` that `include` marks as joined: read the joined object off the payload field, **recursively** `writeEntity` it into its own store (honoring nested `include`), and drop it from the parent's stored shape. The relation's id lives in the sibling plain FK field (or is derived via `model.getKey` when no FK field is declared).
2. Validate the remaining (now relation-object-free) shape against the model's schema. `ref()` fields validate as their `EntityKey` id form (a string / branded id).
3. `store.set(getKey(entity), entity)` — **replace** (goal: always-replace).

`normalizeResult`, `normalizeWritable`/`toEntityId` ([normalize.ts](../../../packages/rxfy/src/state/normalize.ts)), the `sync.serve` parse path, and hydration all funnel through `writeEntity` so recursion and replace-semantics are uniform. The existing top-level `array`/`single` handling becomes the depth-0 case of the same traversal.

`collectEntityTopics` / `collectShapeTopics` continue to drive live-sync subscriptions; recursing them into joined relations is a **follow-on** (see below).

## Server integration (Drizzle + Hono)

The seam is the payload handed to `sync.serve(state, params, payload)`. Because `.with({ category: true })` is the **same shape** as Drizzle's `with: { category: true }`, the include can be defined once and shared, and the Hono handler stays a one-liner:

```ts
// LIST — no join. Drizzle returns flat rows: { id, title, categoryId }
.get("/posts", async (c) => {
  const rows = await db.query.posts.findMany();
  return c.json(sync.serve(postsState, {}, { posts: rows }));
})

// DETAIL — join. Drizzle returns nested: { id, title, categoryId, category: {…} }
.get("/posts/:id", async (c) => {
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, c.req.param("id")),
    with: { category: true },
  });
  return c.json(sync.serve(postState, { id: post.id }, { post }));
})
```

Drizzle's two keys (`categoryId` column, `category` relation object) land in rxfy's two fields with no reshaping. The state's payload (input) type is assignable from Drizzle's inferred return type. `sync.serve`'s existing parse step is replaced by the recursive `writeEntity` traversal so joined objects normalize correctly and the signed `$grant` covers them.

## Affected code (touch points)

| File                                     | Change                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/rxfy/src/model/model.ts`       | `ref()`/`refArray()`; relation `z.registry()`; `createModel` `.shape` walk → `ModelDescriptor.relations`; fail-fast on non-object schema; `StoreKey<T>` brand type; `asKey(model, id)`                                         |
| `packages/rxfy/src/model/model-store.ts` | `get` retyped `get(key: StoreKey<T>)` (rejects arbitrary `string`); `set`/`setMany`/`getValue`/hydration stay `string`; add reactive optional read for `useModelStoreValue`                                                    |
| `packages/rxfy/src/state/state.ts`       | brand entity ids as `StoreKey<T>` in `QueryShapeFromFields`; `.with()` builder on `single`/`array`; `join()` standalone; thread include through `QueryShapeFromFields`, `InputShapeFromFields`, `WritableQueryShapeFromFields` |
| `packages/rxfy/src/state/normalize.ts`   | recursive `writeEntity`; route `normalizeResult`/`normalizeWritable`/`toEntityId` through it; always-replace                                                                                                                   |
| `packages/rxfy-react`                    | `useModelStoreValue(model, id)` reactive optional read (accepts `StoreKey<T> \| null`)                                                                                                                                         |
| `packages/rxfy-server`                   | `sync.serve` parse → recursive `writeEntity`                                                                                                                                                                                   |

Public API additions (`ref`, `refArray`, `.with`, `join`, `useModelStoreValue`, `StoreKey`, `asKey`) require a **minor** changeset per `CLAUDE.md`. `get`'s parameter tightens from `EntityKey<T>` to `StoreKey<T>` — a **type-only** change (runtime identical), shipped as minor with an `asKey` migration note.

## Settled decisions

1. **Semver — ship as minor.** The `get(key)` tightening (`EntityKey<T>` → `StoreKey<T>`) is type-only and runtime-identical; on-pattern code (ids from query shapes) keeps compiling. The changelog documents the `get(rawString)` → `get(asKey(Model, id))` migration for the off-pattern case.
2. **Nested-join helper is `join(Model, include)`.** `.with({ … })` is the method on `single`/`array`; `join(Model, { … })` is the standalone form for a nested include inside a `.with`. Avoids shadowing the JS `with` keyword.
3. **Relation-only fields (no sibling FK) are allowed.** `category: ref(Category)` with no `categoryId` is valid; the relation id derives via `Category.getKey(joinedObject)` and the field is present in the query shape **only** when a state joins it (omitted otherwise).
4. **Top-level fields become `StoreKey` too.** Query-shape entity ids are branded uniformly — `state.post: StoreKey<Post>` as well as joined relations — so every store read goes through one gated `get` and the arbitrary-id hole is closed everywhere.

## Follow-ons (out of first cut)

- Recurse `collectEntityTopics` / `collectShapeTopics` into joined relations so nested entities get live-sync subscriptions and `$grant` topics.
- SSR dehydration/hydration of nested joins (the nested entities already land in their stores via `writeEntity`, so dehydrate should mostly work; verify the two-pass/streaming paths).
- A shared-include helper (define the include object once, feed both `.with()` and Drizzle `with`) if the ergonomics warrant a typed bridge.
