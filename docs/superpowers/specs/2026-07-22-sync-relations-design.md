# Real-time sync for model relations

**Date:** 2026-07-22
**Status:** Approved — ready for implementation plan
**Packages:** `rxfy` (core: `parseShape`, `collectShapeTopics`, `ref`/`refArray`, registry), `rxfy-server` (`sync.serve`), `rxfy-client` (patch handler)

## Context

This is **Plan B** — the sync-layer follow-up to the client-side relations feature (`docs/superpowers/specs/2026-07-21-model-relations-per-state-joins-design.md`, shipped in PR #31). That work made list and detail payloads share one normalized store via `ref()`/`refArray()` + per-state `.with()` joins, over a plain `fetchFn`. It deliberately left the **real-time sync layer** relation-unaware. This spec closes that gap so that when a joined entity changes on the server, every subscribed client updates live — no polling, no refetch.

## Problem

On the sync layer a read endpoint wraps its result in `sync.serve(state, params, data)`, which:

1. **`parseShape(state.fields, data)`** — validates/brands the payload through the field schemas.
2. **`collectShapeTopics(state.fields, parsed)`** — lists a `name:id` topic per entity in the payload.
3. Signs a JWT **grant** (claims: channel + those entity topics + expiry) and returns `{ ...parsed, $grant }`.

The client lifts `$grant`, sends a `subscribe` frame carrying only the grant, and the WS server subscribes that socket to exactly the grant's topics. The client **computes nothing** — [`collectEntityTopics` is unused client-side](../../../packages/rxfy-client/src/sync-client.ts); the [patch handler](../../../packages/rxfy-client/src/sync-client.ts) is generic: `registry.namedStores().get(name)?.set(id, data)`.

Both `parseShape` and `collectShapeTopics` are **top-level only**, giving two failures for a joined payload (post _with_ category):

- **`parseShape` throws.** Post's schema has `category: ref(Category)`, whose runtime validator accepts a `string | undefined` (the normalized id form) — but the joined payload carries a category **object**, which it rejects.
- **The grant omits the nested topic.** `collectShapeTopics` never descends into `post.category`, so `category:c1` isn't in the grant → the client never subscribes → live `patch`/`stale` for that category is neither authorized nor delivered.

And a third, subtler failure once those are fixed:

- **Patches drop the joined relation.** A `patch` is a flat per-entity row applied by raw `store.set` (no `writeEntity`). On a joined detail state, `writeEntity` stored the post as `{ id, title, categoryId: "c1", category: "c1" }` — with a _separate_ extracted `category` id field. A patch returns the flat row `{ id, title, categoryId: "c1" }` (no `category`), and `store.set` **replaces**, so `post.category` vanishes and `get(post.category)` breaks — even on a plain title edit. Root cause: `categoryId` (plain) and `category` (ref) are **independent fields with no declared linkage**, so a flat patch carrying `categoryId` can't maintain `category`.

## Goals

1. **Live updates for joined entities.** When a joined `Category` changes server-side, every client that fetched a post joining it re-renders — through the same store, no refetch.
2. **Server-driven.** The client keeps computing nothing; it subscribes to grant-signed topics. All topic/parse recursion is server-side.
3. **Patches maintain resolvability.** A flat patch to a parent entity keeps its joined relations resolvable.
4. **Additive & backward compatible.** Store-only and non-joined sync apps are unaffected; the new `fk` option is optional.

## Non-goals / deferred

- **Live reassignment to an unloaded entity** (`post.category` c1→c2 where c2 was never fetched). Documented as a known edge with a recovery path; not solved in the first cut.
- **Grant-size optimization** for large to-many joins — mitigated by `permessage-deflate`, noted, not engineered.

## Design

### 1. Model — declare the FK linkage

`createModel` gains an optional, **type-safe** `fk` map linking each relation to its sibling foreign-key column:

```ts
const Post = createModel({
  schema: z.object({
    id: z.string(),
    title: z.string(),
    categoryId: z.string(),
    category: ref(Category),
  }),
  getKey: (p) => p.id,
  name: "post",
  fk: { category: "categoryId" }, // keys = relation fields, values = FK columns — both inferred from the schema
});
```

- `fk` lives on `createModel`, **not** on `ref`: only here is the parent's field set a known type, so keys autocomplete to the relation fields and values to the schema's plain columns (`fk: { category: "titel" }` is a type error). A thunk/function on `ref` can't achieve this — the ref call is evaluated inside `z.object({...})`, before the parent's fields exist as a type.
- Types: `RelationFieldNames<TEntity>` / `FkFieldNames<TEntity>` derive the two sides; `FkMap<TEntity> = Partial<Record<RelationFieldNames, FkFieldNames>>`. `RelationMeta` gains `fk?: string`, merged into the descriptor's `relations` map at `createModel` time.
- **Optional.** With no `fk`, behavior is exactly today's (correct for store-only apps, and for sync apps that never patch an entity carrying that relation). The `fk` is what makes flat patches maintain the relation (§3).
- No new field, no read-model change: `categoryId` (plain) and `category` (ref `StoreKey`) stay as designed; `fk` only records that they mirror.

### 2. Server — recurse `collectShapeTopics` and `parseShape`

Both live in `packages/rxfy/src/state/normalize.ts` and are driven by the **include map** already on the field descriptors (`entry.include`), exactly as `writeEntity`/`normalizeResult` are.

**`collectShapeTopics`** — for a field whose `include` joins a relation, descend into the nested entity/entities and emit `relationModel.name:relationModel.getKey(nested)`, recursively for nested includes:

```
post joined with category  →  ["post:p1", "category:c1"]
post joined with { category: { parent } }  →  ["post:p1", "category:c1", "category-parent:root"]
```

The grant then enumerates the nested topics; the client subscribes to them with no client-side change. This covers **both** delivery paths — a client-side fetch (grant rides the response) and SSR (`grantsHydration` re-embeds the grants `sync.serve` already produced; [hydration.ts](../../../packages/rxfy-server/src/hydration.ts) does no independent entity collection).

**`parseShape`** — for a joined relation field, validate the nested value against the **relation model's** schema (recursively honoring nested includes) and **keep it nested** (denormalized, cleaned: ids branded, unknown columns stripped). Do **not** extract it server-side — the client's `writeEntity` extracts it into the `Category` store, so the nested object must survive to the client. A non-joined relation field is parsed as its id form (today's behavior).

`sync.serve` itself is unchanged beyond passing the include-bearing `state.fields` (which it already does) to these two now-recursive functions.

### 3. Client — relation-aware patch handler

The patch handler mirrors each relation's id from its FK **before** the store write, so a flat patch maintains the join:

```ts
case "patch": {
  const descriptor = registry.descriptor(message.name); // new registry accessor (§5)
  const data = message.data as Record<string, unknown>;
  if (descriptor) {
    for (const [field, meta] of Object.entries(descriptor.relations)) {
      // Mirror the relation id from its FK column so a flat patch keeps `category` resolvable.
      if (meta.fk && meta.fk in data) data[field] = data[meta.fk];
    }
  }
  registry.namedStores().get(message.name)?.set(message.id, data);
  break;
}
```

Effect: a flat patch `{ id, title, categoryId: "c1" }` becomes `{ id, title, categoryId: "c1", category: "c1" }` before `set`, so `get(post.category)` keeps resolving. Relations without an `fk` are left untouched (unchanged behavior). This is the only client change and it is generic (keyed by model name → descriptor → relations).

> Note: patches remain flat per-entity rows. If a patch _does_ carry a nested joined object (an app that re-joins on write), that is out of scope here — the mirror handles the common flat-row case. Extracting nested objects from patches would require routing patches through `writeEntity` and is deferred.

### 4. App wiring — existing machinery

No new server API. The app declares a `Category` resource and publishes on it as usual:

```ts
// a mutation that changes a category
await sync.update(categoryResource, id, { name });
// → publishes patch("category", id, row) to the category:id topic
// → every socket whose grant enumerated category:id (i.e. fetched a post joining it) gets it live
```

The join is what put `category:c1` in those clients' grants (§2); the resource publish is what pushes the update. Both halves already exist — this spec only makes the _join_ enumerate the topic.

### 5. Supporting change — descriptor lookup by name

The patch handler needs the model descriptor (for its `relations`/`fk`) from the model name on the wire. Add `IModelRegistry.descriptor(name: string): AnyModelDescriptor | undefined` — a thin accessor over the existing name→store bookkeeping (the registry already tracks descriptors in `stores()`). Client-only consumer for now; harmless server-side.

## Known edge — live reassignment to an unloaded entity

Reassigning `post.category` from c1 to c2 **live** (not via refetch): the patch sets `categoryId: c2`, the handler mirrors `category: c2`, but the client never fetched c2 and its grant only covers `category:c1` — so `get(post.category)` dangles. This is the same page-contract invariant as the client feature, surfaced by a live edit.

Recovery paths (app's choice, documented — not enforced):

- **Model the reassignment as a `stale`** on the detail channel instead of a `patch`, so the client refetches and re-joins c2 (and gets a fresh grant covering `category:c2`). This is the recommended pattern for changes that alter _which_ entities a payload references.
- **Read the relation via `useModelStoreValue`** where a component must tolerate an unresolved reference.

## Affected code (touch points)

| File                                      | Change                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/rxfy/src/model/model.ts`        | type-safe `createModel` `fk` map (`FkMap`/`RelationFieldNames`/`FkFieldNames`); `RelationMeta` gains `fk?: string` merged in |
| `packages/rxfy/src/state/normalize.ts`    | recurse `collectShapeTopics` and `parseShape` into joined relations (include-driven)                                         |
| `packages/rxfy/src/model/model-store.ts`  | add `IModelRegistry.descriptor(name)` accessor                                                                               |
| `packages/rxfy-client/src/sync-client.ts` | relation-aware patch handler (mirror `fk` → relation id before `set`)                                                        |
| `packages/rxfy-server/src/sync.ts`        | none beyond calling the now-recursive helpers (already passes `state.fields`)                                                |

Public API additions (`ref`/`refArray` `fk` option, `registry.descriptor`) require a **minor** changeset. No breaking changes; all additions are additive.

## Open decisions (settle into the plan)

1. **`parseShape` non-joined relation field.** When a relation is _not_ joined, the payload carries the id in the sibling FK column and typically omits the `ref` field entirely. Confirm `parseShape` treats an absent `ref` field as valid (it validates `string | undefined`) and does not require the FK/ref correspondence at parse time.
2. **Dev-mode FK/id consistency check.** Optionally warn when a joined nested entity's `getKey` disagrees with the parent's `fk` column value (they should be equal). Cheap correctness net; decide whether it's worth the branch.

## Follow-ons (out of this cut)

- Patches that carry nested joined objects (route through `writeEntity`) — for apps that re-join on write.
- Grant-size ergonomics for wide `refArray` joins (beyond `permessage-deflate`).
- An opt-in "resolve-on-reassignment" that fetches a newly-referenced entity live instead of requiring a `stale`.
