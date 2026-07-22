# Real-time Sync for Model Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the real-time sync layer relation-aware so a change to a joined entity pushes live to every subscribed client — by recursing the server's grant/parse into joined relations and mirroring a relation's id from its FK column on inbound patches.

**Architecture:** Sync is server-driven — the client subscribes to grant-signed `name:id` topics and computes nothing. So: (1) `ref(Model, { fk })` records the FK linkage and the `ref` validator relaxes to accept the joined object; (2) `parseShape` and `collectShapeTopics` recurse into joined relations (include-driven, like `writeEntity`), so the grant enumerates nested topics and the served payload keeps nested entities for the client to normalize; (3) the client patch handler mirrors `relation ← fk` before `store.set`, so flat patches keep joins resolvable; (4) a new `registry.descriptor(name)` lets the patch handler reach the relations map.

**Tech Stack:** TypeScript, zod 4, RxJS, Vitest, packages `rxfy` / `rxfy-server` / `rxfy-client`.

**Spec:** `docs/superpowers/specs/2026-07-22-sync-relations-design.md`

**Conventions:**

- Single-package tests: `pnpm --filter rxfy test`, `pnpm --filter rxfy-client test`; type-check: `pnpm --filter rxfy check-types`.
- Colocated tests, `.js` import extensions, `expectTypeOf`/`@ts-expect-error` for type tests.
- After a `rxfy` source change that `rxfy-server`/`rxfy-client` type-check against, rebuild: `pnpm --filter rxfy build` (they resolve `rxfy` from `dist`).
- Commits: no `Co-Authored-By` trailer.

---

## Phase 1 — Model: `fk` option + relaxed `ref` validators

### Task 1: `ref`/`refArray` accept `{ fk }`; `RelationMeta.fk`; validators accept joined objects

**Files:**

- Modify: `packages/rxfy/src/model/model.ts`
- Test: `packages/rxfy/src/model/model.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/model/model.test.ts` (inside the existing `describe("ref / refArray", ...)` or as a new block; `cat`, `relationRegistry`, `ref`, `refArray` are already imported):

```ts
describe("ref fk option + relaxed validation", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "fkcat",
  });

  it("records the fk column in the relation metadata", () => {
    const schema = ref(cat, { fk: "categoryId" });
    expect(relationRegistry.get(schema)).toEqual({ model: cat, kind: "single", fk: "categoryId" });
    expect(relationRegistry.get(refArray(cat, { fk: "tagIds" }))).toEqual({ model: cat, kind: "array", fk: "tagIds" });
  });

  it("omits fk when not given (back-compat)", () => {
    expect(relationRegistry.get(ref(cat))).toEqual({ model: cat, kind: "single", fk: undefined });
  });

  it("the ref validator accepts a string id, undefined, or a joined object (pre-extraction)", () => {
    const schema = ref(cat);
    expect(schema.safeParse("c1").success).toBe(true);
    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse({ id: "c1", name: "News" }).success).toBe(true); // joined object on the serve path
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test model.test -- --run`
Expected: FAIL — `ref` takes no options; metadata has no `fk`; the joined-object parse currently returns `false`.

- [ ] **Step 3: Implement the `fk` option + relaxed validators**

In `packages/rxfy/src/model/model.ts`, extend `RelationMeta`:

```ts
export type RelationMeta = {
  readonly model: ModelDescriptor<any, any>;
  readonly kind: "single" | "array";
  /** Sibling foreign-key column this relation mirrors; lets flat sync patches keep the relation id. */
  readonly fk?: string;
};
```

Replace `ref` and `refArray` (accept an options arg, relax the validator to allow the joined object, thread `fk` into the registry):

```ts
export function ref<TEntity, TKey extends string, TInput>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
  opts?: { fk?: string },
): z.ZodType<StoreKey<TEntity> | undefined, StoreKey<TEntity> | TInput | undefined> {
  // Accepts undefined (field absent when not joined), a string id (normalized), or an object
  // (a joined entity on the serve path, before writeEntity/parseShape extracts it).
  const schema = z.custom<StoreKey<TEntity> | undefined>(
    (v) => v === undefined || typeof v === "string" || (typeof v === "object" && v !== null),
  );
  schema.register(relationRegistry, { model, kind: "single", fk: opts?.fk });
  return schema as unknown as z.ZodType<StoreKey<TEntity> | undefined, StoreKey<TEntity> | TInput | undefined>;
}

export function refArray<TEntity, TKey extends string, TInput>(
  model: ModelDescriptor<TEntity, TKey, TInput>,
  opts?: { fk?: string },
): z.ZodType<StoreKey<TEntity>[] | undefined, (StoreKey<TEntity> | TInput)[] | undefined> {
  const schema = z.custom<StoreKey<TEntity>[] | undefined>((v) => v === undefined || Array.isArray(v));
  schema.register(relationRegistry, { model, kind: "array", fk: opts?.fk });
  return schema as unknown as z.ZodType<StoreKey<TEntity>[] | undefined, (StoreKey<TEntity> | TInput)[] | undefined>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test model.test -- --run` → PASS.
Run: `pnpm --filter rxfy check-types` → PASS.

> Note: existing tests assert `relationRegistry.get(schema)` equals `{ model, kind }` without `fk`. `toEqual` treats `{ model, kind, fk: undefined }` as **equal** to `{ model, kind }` in Vitest (undefined-valued keys are ignored), so they stay green. If any use `toStrictEqual`, update them to include `fk: undefined`.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/model/model.ts packages/rxfy/src/model/model.test.ts
git commit -m "feat(rxfy): ref/refArray fk option and joined-object-tolerant validators"
```

---

## Phase 2 — Server: recurse `parseShape` and `collectShapeTopics`

### Task 2: relation-aware `parseShape`

**Files:**

- Modify: `packages/rxfy/src/state/normalize.ts` (`parseShape` + a `parseEntity` helper)
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/state/normalize.test.ts` (imports `parseShape` — add it to the existing `./normalize.js` import; `ref`, `single`, `array`, `createModel` already imported):

```ts
describe("parseShape with joined relations", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "pscat",
  });
  const post = createModel({
    schema: z.object({
      id: z.string(),
      title: z.string(),
      categoryId: z.string(),
      category: ref(cat, { fk: "categoryId" }),
    }),
    getKey: (p) => p.id,
    name: "pspost",
  });

  it("keeps a joined relation nested and cleans it (strips unknown columns)", () => {
    const fields = { post: single(post).with({ category: true }) };
    const parsed = parseShape<{ post: Record<string, unknown> }>(fields, {
      post: { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News", secret: "x" } },
    });
    // nested entity preserved (client normalizes it) but cleaned by the Category schema:
    expect(parsed.post.category).toEqual({ id: "c1", name: "News" });
    expect(parsed.post.categoryId).toBe("c1");
  });

  it("parses a non-joined payload (relation field absent) without throwing", () => {
    const fields = { posts: array(post) };
    const parsed = parseShape<{ posts: Record<string, unknown>[] }>(fields, {
      posts: [{ id: "p2", title: "T2", categoryId: "c9" }],
    });
    expect(parsed.posts[0]).toMatchObject({ id: "p2", title: "T2", categoryId: "c9" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test normalize.test -- --run`
Expected: FAIL — first case throws today (post schema rejected the joined `category` object before Task 1; after Task 1 the object passes through **uncleaned**, so `secret` survives and the assertion fails).

- [ ] **Step 3: Implement `parseEntity` recursion**

In `packages/rxfy/src/state/normalize.ts`, add a helper and route `parseShape`'s entity branch through it:

```ts
/** Parse one entity with its schema, recursing into joined relations (cleaned but kept nested). */
function parseEntity(descriptor: AnyModelDescriptor, raw: unknown, include: IncludeMap | undefined): unknown {
  const parsed = descriptor.schema.parse(raw) as Record<string, unknown>;
  const source = raw as Record<string, unknown>;
  for (const [field, meta] of Object.entries(descriptor.relations)) {
    const spec = include?.[field];
    if (!spec) continue; // not joined — leave the parsed id/undefined as-is
    const nested = source[field];
    if (nested === undefined || nested === null) continue;
    const nestedInclude = typeof spec === "object" ? (spec as JoinSpec).include : undefined;
    parsed[field] =
      meta.kind === "array"
        ? (nested as unknown[]).map((el) => parseEntity(meta.model, el, nestedInclude))
        : parseEntity(meta.model, nested, nestedInclude);
  }
  return parsed;
}
```

Update `parseShape`'s entity branch (the `isFieldDescriptor(entry)` case):

```ts
value[fieldName] =
  entry.kind === "array"
    ? (fieldValue as unknown[]).map((el) => parseEntity(entry.model, el, entry.include))
    : parseEntity(entry.model, fieldValue, entry.include);
```

(`AnyModelDescriptor`, `IncludeMap`, `JoinSpec` are already imported in this file from Plan A.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test normalize.test -- --run` → PASS.
Run: `pnpm --filter rxfy test -- --run` → PASS (the existing `parseShape` test with relation-free models is unaffected: no relations, `include` undefined, so `parseEntity` == `schema.parse`).
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "feat(rxfy): recurse parseShape into joined relations (kept nested, cleaned)"
```

---

### Task 3: recurse `collectShapeTopics` into joined relations

**Files:**

- Modify: `packages/rxfy/src/state/normalize.ts` (`collectShapeTopics` + a `collectFromEntity` helper)
- Test: `packages/rxfy/src/state/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/state/normalize.test.ts` (`collectShapeTopics` already imported):

```ts
describe("collectShapeTopics with joined relations", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "ctcat",
  });
  const post = createModel({
    schema: z.object({
      id: z.string(),
      title: z.string(),
      categoryId: z.string(),
      category: ref(cat, { fk: "categoryId" }),
    }),
    getKey: (p) => p.id,
    name: "ctpost",
  });

  it("emits nested entity topics for joined relations", () => {
    const fields = { post: single(post).with({ category: true }) };
    const shape = { post: { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News" } } };
    expect(collectShapeTopics(fields, shape).sort()).toEqual(["ctpost:p1", "ctcat:c1"].sort());
  });

  it("omits nested topics when the relation is not joined", () => {
    const fields = { posts: array(post) };
    const shape = { posts: [{ id: "p2", title: "T2", categoryId: "c9" }] };
    expect(collectShapeTopics(fields, shape)).toEqual(["ctpost:p2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test normalize.test -- --run`
Expected: FAIL — first case yields only `["ctpost:p1"]` (no `ctcat:c1`).

- [ ] **Step 3: Implement recursion**

In `packages/rxfy/src/state/normalize.ts`, add a helper and use it in `collectShapeTopics`:

```ts
/** Push `name:id` for an entity and, per the include map, its joined relations (recursively). */
function collectFromEntity(
  descriptor: AnyModelDescriptor,
  entity: unknown,
  include: IncludeMap | undefined,
  out: string[],
): void {
  out.push(`${descriptor.name}:${descriptor.getKey(entity as never)}`);
  const source = entity as Record<string, unknown>;
  for (const [field, meta] of Object.entries(descriptor.relations)) {
    const spec = include?.[field];
    if (!spec) continue;
    const nested = source[field];
    if (nested === undefined || nested === null) continue;
    const nestedInclude = typeof spec === "object" ? (spec as JoinSpec).include : undefined;
    if (meta.kind === "array") {
      for (const el of nested as unknown[]) collectFromEntity(meta.model, el, nestedInclude, out);
    } else {
      collectFromEntity(meta.model, nested, nestedInclude, out);
    }
  }
}
```

Rewrite `collectShapeTopics`'s entity branches to delegate:

```ts
export function collectShapeTopics(fields: FieldsMap, shape: Record<string, unknown>): string[] {
  const topics: string[] = [];
  for (const [fieldName, entry] of Object.entries(fields)) {
    if (!isFieldDescriptor(entry)) continue; // plain-value fields carry no entities
    const value = shape[fieldName];
    if (entry.kind === "array") {
      for (const entity of (value as unknown[]) ?? []) collectFromEntity(entry.model, entity, entry.include, topics);
    } else if (value !== undefined && value !== null) {
      collectFromEntity(entry.model, value, entry.include, topics);
    }
  }
  return topics;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test normalize.test -- --run` → PASS.
Run: `pnpm --filter rxfy test -- --run` → PASS (existing `collectShapeTopics` tests use relation-free models → `include` undefined → no recursion, identical output).
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy/src/state/normalize.ts packages/rxfy/src/state/normalize.test.ts
git commit -m "feat(rxfy): recurse collectShapeTopics into joined relations for the grant"
```

---

## Phase 3 — Registry accessor + client patch handler

### Task 4: `IModelRegistry.descriptor(name)` accessor

**Files:**

- Modify: `packages/rxfy/src/model/model-store.ts` (`IModelRegistry` type + `createModelRegistry`)
- Test: `packages/rxfy/src/model/model-store.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/rxfy/src/model/model-store.test.ts`:

```ts
describe("registry.descriptor(name)", () => {
  const m = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "desc-lookup" });

  it("returns the descriptor for a materialized model, undefined otherwise", () => {
    const reg = createModelRegistry(m);
    expect(reg.descriptor("desc-lookup")).toBe(m);
    expect(reg.descriptor("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy test model-store.test -- --run`
Expected: FAIL — `descriptor` is not a function.

- [ ] **Step 3: Implement the accessor**

In `packages/rxfy/src/model/model-store.ts`, add to the `IModelRegistry` type (near `store`):

```ts
/** The registered descriptor for a model name, or undefined if never materialized. */
descriptor: (name: string) => AnyModelDescriptor | undefined;
```

In `createModelRegistry`, add a name→descriptor map and populate it where the store is created. Find the existing `named.set(descriptor.name, store);` line inside `model` and add beside it:

```ts
namedDescriptors.set(descriptor.name, descriptor);
```

Declare the map next to the other maps at the top of `createModelRegistry`:

```ts
const namedDescriptors = new Map<string, AnyModelDescriptor>();
```

Add the method to the returned `registry` object (next to `store`):

```ts
    descriptor: (name) => namedDescriptors.get(name),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy test model-store.test -- --run` → PASS.
Run: `pnpm --filter rxfy check-types` → PASS.

- [ ] **Step 5: Rebuild rxfy (rxfy-client resolves it from dist)**

Run: `pnpm --filter rxfy build`
Expected: build success with `.d.ts` emitted.

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy/src/model/model-store.ts packages/rxfy/src/model/model-store.test.ts
git commit -m "feat(rxfy): add IModelRegistry.descriptor(name) accessor"
```

---

### Task 5: relation-aware patch handler (mirror `fk` → relation id)

**Files:**

- Modify: `packages/rxfy-client/src/sync-client.ts` (the `case "patch":` handler)
- Test: `packages/rxfy-client/src/sync-client.test.ts`

- [ ] **Step 1: Write the failing test**

Add `ref` to the `rxfy` import (the file already imports `createModel, createModelRegistry` from `rxfy`). Add this test inside the existing top-level `describe` (the file already has the `fakeTransport()` harness returning `{ transport, deliver }`):

```ts
it("mirrors a relation id from its fk column on an inbound flat patch", () => {
  const cat = createModel({
    schema: z.object({ id: z.string(), name: z.string() }),
    getKey: (c) => c.id,
    name: "sccat",
  });
  const post = createModel({
    schema: z.object({
      id: z.string(),
      title: z.string(),
      categoryId: z.string(),
      category: ref(cat, { fk: "categoryId" }),
    }),
    getKey: (p) => p.id,
    name: "scpost",
  });
  const registry = createModelRegistry(cat).add(post);
  registry.model(post).set("p1", { id: "p1", title: "old", categoryId: "c1", category: "c1" } as never);
  const { transport, deliver } = fakeTransport();
  createSyncClient({ registry, transport });

  deliver(patch("scpost", "p1", { id: "p1", title: "new", categoryId: "c1" }));

  // the flat patch had no `category`; the handler mirrored it from `categoryId`
  expect(registry.model(post).getValue("p1")).toEqual({ id: "p1", title: "new", categoryId: "c1", category: "c1" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter rxfy-client test sync-client -- --run`
Expected: FAIL — stored value lacks `category` (raw `store.set` wrote the flat row as-is).

- [ ] **Step 3: Implement the relation-aware handler**

In `packages/rxfy-client/src/sync-client.ts`, replace the `case "patch":` body:

```ts
      case "patch": {
        const data = message.data as Record<string, unknown>;
        const descriptor = registry.descriptor(message.name);
        if (descriptor) {
          for (const [field, meta] of Object.entries(descriptor.relations)) {
            // Mirror the relation id from its FK column so a flat patch keeps the relation resolvable.
            if (meta.fk && meta.fk in data) data[field] = data[meta.fk];
          }
        }
        registry.namedStores().get(message.name)?.set(message.id, data);
        break;
      }
```

(`registry` is already the `IModelRegistry` from `SyncClientConfig`. `message.name`/`message.id`/`message.data` are the existing patch frame fields.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter rxfy-client test sync-client -- --run` → PASS.
Run: `pnpm --filter rxfy-client check-types` → PASS.
Confirm the existing "applies an inbound patch to the matching store" test still passes (its model has no relations → `descriptor.relations` empty → loop no-op → identical behavior).

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-client/src/sync-client.ts packages/rxfy-client/src/sync-client.test.ts
git commit -m "feat(rxfy-client): mirror relation id from fk column on inbound patches"
```

---

## Phase 4 — Server end-to-end + changeset

### Task 6: server e2e — serve a joined payload

**Files:**

- Test: `packages/rxfy-server/src/sync.relations.test.ts` (create)

- [ ] **Step 1: Write the test**

Create `packages/rxfy-server/src/sync.relations.test.ts` (harness copied verbatim from `sync.test.ts` — `createSync`, `createInMemoryHub`, `verifyGrant`, a `fakeStorage` stub):

```ts
import { createModel, defineState, ref, single } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { verifyGrant } from "./grant.js";
import { createInMemoryHub } from "./hub.js";
import type { SyncStorage } from "./storage.js";
import { createSync } from "./sync.js";

const cat = createModel({
  schema: z.object({ id: z.string(), name: z.string() }),
  getKey: (c) => c.id,
  name: "e2ecat",
});
const post = createModel({
  schema: z.object({
    id: z.string(),
    title: z.string(),
    categoryId: z.string(),
    category: ref(cat, { fk: "categoryId" }),
  }),
  getKey: (p) => p.id,
  name: "e2epost",
});
const postState = defineState({
  key: "post",
  params: z.object({ id: z.string() }),
  model: { post: single(post).with({ category: true }) },
});

function fakeStorage(): SyncStorage<{ name: string }> {
  return {
    create: vi.fn(async (_b, v) => v),
    update: vi.fn(async (_b, id, v) => ({ id, ...(v as object) })),
    delete: vi.fn(async () => {}),
  };
}

describe("sync.serve with a joined relation", () => {
  it("returns the cleaned nested entity and a grant enumerating the nested topic", () => {
    const sync = createSync({ storage: fakeStorage(), hub: createInMemoryHub(), secret: "s" });
    const served = sync.serve(
      postState,
      { id: "p1" },
      {
        post: { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News", extra: "stripped" } },
      },
    );
    expect(served.post.category).toEqual({ id: "c1", name: "News" }); // nested, unknown key stripped
    const claims = verifyGrant(served.$grant, { secret: "s" });
    expect(claims?.entities).toContain("e2epost:p1");
    expect(claims?.entities).toContain("e2ecat:c1");
  });
});
```

If `createInMemoryHub`/`verifyGrant`/`SyncStorage` import paths differ from `sync.test.ts`, match that file exactly (it is the source of truth for the harness).

- [ ] **Step 2: Run the test**

Run: `pnpm --filter rxfy-server test sync.relations -- --run`
Expected: PASS (Tasks 1-3 make serve relation-aware end to end).

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-server/src/sync.relations.test.ts
git commit -m "test(rxfy-server): serve a joined relation — nested payload + nested grant topic"
```

---

### Task 7: changeset + full verification

**Files:**

- Create: `.changeset/sync-relations.md`

- [ ] **Step 1: Write the changeset**

Create `.changeset/sync-relations.md`:

```md
---
"rxfy": minor
"rxfy-client": minor
---

Real-time sync for model relations. `ref`/`refArray` accept `{ fk }` linking a relation to its foreign-key column; `sync.serve` now recurses joined relations so the signed grant enumerates nested entity topics (client-fetch and SSR) and the served payload keeps nested entities for the client to normalize; the client patch handler mirrors a relation's id from its `fk` column so a flat patch keeps the relation resolvable. New `registry.descriptor(name)` accessor. Additive — store-only and non-joined apps are unaffected.
```

- [ ] **Step 2: Verify changeset + full workspace**

Run: `pnpm changeset status` → lists `rxfy` and `rxfy-client` at **minor**, no major (peer ranges were fixed in the client-relations PR).
Run: `pnpm --filter rxfy build` (refresh dist for downstream consumers).
Run: `pnpm turbo check-types test lint build` → all green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/sync-relations.md
git commit -m "chore: changeset for real-time sync relations (minor)"
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** `fk` option + relaxed validators (T1, spec §1); `parseShape` recursion (T2, spec §2); `collectShapeTopics` recursion → grant nested topics, covers SSR via `grantsHydration` re-embed (T3, spec §2); `registry.descriptor` (T4, spec §5); relation-aware patch handler mirroring `fk` (T5, spec §3); server e2e (T6). App wiring (§4) uses existing `sync.update`/resources — no code change, exercised implicitly.
- **Open decisions from the spec:** (1) `parseShape` treats an absent `ref` field as valid — covered by Task 2's non-joined test (relation field omitted → `parseEntity` == `schema.parse`, no throw). (2) Dev FK/id consistency check — **not implemented** (deemed not worth the branch for the first cut); can be added later.
- **Known edge (live reassignment to an unloaded entity):** documented in the spec, no code — recovery is app-level (`stale`/refetch or `useModelStoreValue`).
- **Deferred (spec follow-ons):** patches carrying nested joined objects (route through `writeEntity`); grant-size ergonomics for wide `refArray`.
- **Back-compat checks baked into steps:** existing `parseShape`/`collectShapeTopics`/patch tests use relation-free models, so every recursion is a no-op there; `ref` metadata gains `fk: undefined` (equal under `toEqual`).
