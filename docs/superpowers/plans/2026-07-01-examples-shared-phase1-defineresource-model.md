# examples-shared Phase 1 — `defineResource({ model })` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `rxfy-server`'s `defineResource` accept an optional pre-made rxfy `model`, so a live resource can bind to a shared `ModelDescriptor` (instead of deriving a fresh one from the Drizzle table) — the linchpin for vite-blog-framework using the shared `examples-shared` models.

**Architecture:** Add an optional `model?: ModelDescriptor<InferSelectModel<TTable>>` to `defineResource`'s config. When provided, the resource uses that model (its `.schema`/`.getKey`/`.name`) and the table only drives SQL (PK detection unchanged). When omitted, behavior is exactly as today. Backward-compatible (new optional field).

**Tech Stack:** TypeScript, drizzle-orm, rxfy (`createModel`/`ModelDescriptor`), Vitest. Package `packages/rxfy-server`.

Spec: `docs/superpowers/specs/2026-07-01-examples-shared-design.md` §4. This is Phase 1 of 4 (framework tweak → examples-shared package → migrate vite → migrate next/rr7/waku).

---

## File Structure

| File | Change |
|---|---|
| `packages/rxfy-server/src/resource.ts` | add optional `model` to `defineResource` config + the injected-model branch |
| `packages/rxfy-server/src/resource.test.ts` | tests for the injected-model path |
| `packages/rxfy-server/src/server.test.ts` | test that `grant` enumerates the injected model's store |
| `.changeset/rxfy-server-resource-model.md` | changeset |

---

## Task 1: `defineResource({ model })`

**Files:**
- Modify: `packages/rxfy-server/src/resource.ts`
- Test: `packages/rxfy-server/src/resource.test.ts`

- [ ] **Step 1: Write the failing test** — append to `packages/rxfy-server/src/resource.test.ts` (inside the existing `describe("defineResource", ...)` block; `createModel` is imported from `rxfy` — add it to the existing imports if not present, and `z` from `zod` is already imported):

```ts
  it("uses an injected model instead of deriving one", () => {
    const sharedPost = createModel({
      schema: z.object({ id: z.string(), orgId: z.string(), title: z.string(), views: z.number() }),
      getKey: (p: { id: string }) => p.id,
      name: "post",
    });
    const r = defineResource({ table: posts, model: sharedPost });
    // the resource exposes the EXACT injected model + its name/schema/getKey
    expect(r.model).toBe(sharedPost);
    expect(r.name).toBe("post");
    expect(r.zod).toBe(sharedPost.schema);
    expect(r.getKey).toBe(sharedPost.getKey);
    // the PK column is still detected from the table (drives SQL)
    expect(r.primaryKeyColumn).toBe("id");
  });

  it("prefers an explicit name over the injected model's name", () => {
    const m = createModel({ schema: z.object({ id: z.string() }), getKey: (p: { id: string }) => p.id, name: "post" });
    const r = defineResource({ table: posts, name: "article", model: m });
    expect(r.name).toBe("article");
    expect(r.model).toBe(m);
  });
```
> The `posts` table fixture already exists at the top of `resource.test.ts` (`pgTable("posts", { id: text("id").primaryKey(), orgId, title, views })`). If `createModel` isn't already imported there, add `createModel` to the `import { … } from "rxfy"` line (or add such an import).

- [ ] **Step 2: Run to verify it FAILS**

Run: `pnpm --filter rxfy-server exec vitest run src/resource.test.ts`
Expected: FAIL — `defineResource` doesn't accept `model` yet (type error / `r.model` not the injected instance).

- [ ] **Step 3: Implement** — replace the `defineResource` function in `packages/rxfy-server/src/resource.ts` (lines 55–79) with:

```ts
/** Derive a resource from a Drizzle table, or bind the table to a pre-made rxfy `model`. No codegen. */
export function defineResource<TTable extends PgTable, const TName extends string = string>(config: {
  table: TTable;
  // @todo we can derive name from PgTable type using infer from TableConfig
  name?: TName;
  /** A pre-made rxfy model to bind (e.g. a shared model). When omitted, one is derived via drizzle-zod. */
  model?: ModelDescriptor<InferSelectModel<TTable>>;
}): Resource<TTable, InferSelectModel<TTable>, TName> {
  type TRow = InferSelectModel<TTable>;

  const pk = primaryKeyColumn(config.table);
  const name = (config.name ?? config.model?.name ?? getTableConfig(config.table).name) as TName;

  if (config.model) {
    // Bind the table (for SQL) to the supplied model (for the client store / live routing).
    return {
      table: config.table,
      name,
      model: config.model,
      zod: config.model.schema,
      getKey: config.model.getKey,
      primaryKeyColumn: pk,
    };
  }

  // drizzle-zod's output type and InferSelectModel agree at runtime (verified); bridge the nominal gap.
  // We use `any` for the TInput param to avoid TS2719 (dual-module ZodType identity clash).
  const zod = createSelectSchema(config.table) as unknown as z.ZodType<TRow, any>;
  const getKey = (row: TRow): string => String((row as Record<string, unknown>)[pk]);
  const model = createModel<TRow, string>({ schema: zod, getKey, name });

  return {
    table: config.table,
    name,
    model,
    zod,
    getKey,
    primaryKeyColumn: pk,
  };
}
```
> Note the doc comment near the injected-model branch that when a `model` is injected, `resource.name` defaults to the model's `name` so live `patch`/`stale` topics route into the model's store. If `check-types` flags `config.model.getKey` (returns the model's `TKey extends string`) against `Resource.getKey: (row) => string`, that's assignable (a branded string IS a string); if TS still complains, add a minimal cast `config.model.getKey as (row: TRow) => string` and report.

- [ ] **Step 4: Run to verify it PASSES**

Run: `pnpm --filter rxfy-server exec vitest run src/resource.test.ts`
Expected: PASS — all existing resource tests plus the two new injected-model tests.

- [ ] **Step 5: Lint + type-check + commit**

Run `pnpm --filter rxfy-server lint` (run `pnpm --filter rxfy-server exec eslint . --fix` first if the linter reformats, then re-run `lint` and confirm exit 0 — do NOT pipe through `tail`) and `pnpm --filter rxfy-server check-types` (exit 0).
```bash
git add packages/rxfy-server/src/resource.ts packages/rxfy-server/src/resource.test.ts
git commit -m "feat(rxfy-server): defineResource accepts a pre-made model"
```

---

## Task 2: `grant` enumerates the injected model's store

**Files:**
- Test: `packages/rxfy-server/src/server.test.ts`

This proves the point of Task 1: a resource built with an injected model, when granted, reads that model's store (so vite's live grants work against the shared model).

- [ ] **Step 1: Append the failing test** — add to `packages/rxfy-server/src/server.test.ts` (inside the existing `describe("createServer.grant", ...)` block). Merge any new imports (`createModel` from `rxfy`, `pgTable`/`text` from `drizzle-orm/pg-core`, `defineResource` from `./resource.js`) into the existing import lines — do not duplicate imports:

```ts
  it("grants entity ids from an injected model's store", async () => {
    const db = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);

    // a shared model + a resource bound to it (not derived from the table)
    const sharedPost = createModel({
      schema: z.object({ id: z.string(), orgId: z.string(), title: z.string() }),
      getKey: (p: { id: string }) => p.id,
      name: "post",
    });
    const sharedPostResource = defineResource({ table: postsTable, model: sharedPost });

    const registry = createModelRegistry();
    registry.model(sharedPost).setMany([
      { id: "1", orgId: "A", title: "a" },
      { id: "2", orgId: "A", title: "b" },
    ]);

    const grants = live.grant(registry, { entities: sharedPostResource });
    expect(grants.entities).toEqual({
      "post:1": keyer.current("post:1"),
      "post:2": keyer.current("post:2"),
    });
  });
```
> `server.test.ts` already defines `postsTable`, `createTestDb`, `CREATE_POSTS`, `harness`, `keyer`, and imports `createModelRegistry` from `rxfy`. Add `import { z } from "zod";` if not present, and `createModel` to the `rxfy` import. `sharedPost`'s schema uses plain `z.string()` id (not branded) to keep the test simple; `title` here differs from the table's columns but that's fine — grant only reads the store's keys.

- [ ] **Step 2: Run → PASS**

Run: `pnpm --filter rxfy-server exec vitest run src/server.test.ts`
Expected: PASS — the new grant test plus all existing server tests. (This test passes once Task 1 is implemented; it documents/locks the behavior.)

- [ ] **Step 3: Lint + check-types + commit**

Run `pnpm --filter rxfy-server lint` (fix + re-lint, exit 0) and `pnpm --filter rxfy-server check-types` (exit 0).
```bash
git add packages/rxfy-server/src/server.test.ts
git commit -m "test(rxfy-server): grant enumerates an injected model's store"
```

---

## Task 3: Changeset + full verification

**Files:**
- Create: `.changeset/rxfy-server-resource-model.md`

- [ ] **Step 1: Create the changeset**

`.changeset/rxfy-server-resource-model.md`:
```md
---
"rxfy-server": minor
---

`defineResource` now accepts an optional pre-made `model` (`defineResource({ table, model })`), binding a Drizzle table to an existing rxfy `ModelDescriptor` instead of deriving one — so a live resource can share a model with client code.
```

- [ ] **Step 2: Verify Changesets accepts it**

Run: `pnpm changeset status` — lists `rxfy-server` (with its fixed-group siblings) and no error.

- [ ] **Step 3: Full package gate**

Run: `pnpm turbo build test lint check-types --filter=rxfy-server`
Expected: all four tasks succeed (build, the full test suite incl. the new tests, lint, check-types).

- [ ] **Step 4: Commit**

```bash
git add .changeset/rxfy-server-resource-model.md
git commit -m "chore(rxfy-server): changeset for defineResource model injection"
```

---

## Self-Review Notes

- **Spec coverage:** implements §4 exactly — `defineResource({ model })` uses the injected model (`.model`/`.zod`/`.getKey`/`.name`), keeps table-driven PK detection, and `grant` enumerates the injected model's store (Task 2). Backward-compatible (Task 1's else-branch is the current code verbatim). Changeset per §2/§9.
- **Type consistency:** the new field is `model?: ModelDescriptor<InferSelectModel<TTable>>`; `Resource.model`/`.zod`/`.getKey` types are unchanged and satisfied by the injected model (`schema: z.ZodType<TRow, any>`, `getKey: (row) => TKey extends string`). The `const TName` inference is preserved.
- **No new runtime deps.** The injected-model branch adds no imports (`ModelDescriptor`/`createModel` already imported).
- **Out of scope (later phases):** the `examples-shared` package, Hono RPC, and the four example migrations.
