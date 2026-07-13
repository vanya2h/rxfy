# rxfy-server Resource Derivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `defineResource` and `createResourceRegistry` to `rxfy-server` — derive an rxfy `ModelDescriptor` (and Zod schema, `getKey`, name) from a Drizzle Postgres table with no codegen, and index resources by name for the server and client live layers.

**Architecture:** A **resource** binds a Drizzle table to an rxfy model. `defineResource({ table, name? })` uses `drizzle-zod`'s `createSelectSchema(table)` (native zod v4) for the schema, detects the single primary-key column (via `column.primary === true` over `Object.keys(table)`), builds a `getKey` that reads that column, defaults the model `name` to the SQL table name (`getTableConfig(table).name`), and wraps it all with rxfy's `createModel`. `createResourceRegistry([...])` indexes resources by name (rejecting duplicates) for `name → model/table` lookups. Composite and missing primary keys throw (single-column PK is the v1 contract).

**Tech Stack:** TypeScript, drizzle-orm 0.45.x, drizzle-zod 0.8.x, zod 4.x, rxfy (workspace), Vitest. Verified working versions: drizzle-orm 0.45.2, drizzle-zod 0.8.3, zod 4.4.3 — `createSelectSchema` produces native zod v4 schemas whose keys are the JS (camelCase) property names.

This is Plan 3 of the rxfy live framework. It implements design spec §5.1 (`defineResource`, resource registry) from `docs/superpowers/specs/2026-06-30-rxfy-server-design.md`. Branch: `feat/rxfy-server-framework` (already has `rxfy-protocol` and the `rxfy-server` foundation: `topic-key.ts`, `state-channel.ts`).

> **Note on resource-level channels:** earlier spec drafts showed `channels` on `defineResource`. The design settled on **state-level** invalidation via `invalidationChannel(state, params)` (already built in the foundation plan) + `defineState`'s `window`. So `defineResource` here does NOT carry channels — invalidation addressing lives on the state side. This is intentional, not an omission.

---

## File Structure

| File                                                 | Responsibility                                   |
| ---------------------------------------------------- | ------------------------------------------------ |
| `packages/rxfy-server/package.json`                  | Add drizzle/zod/rxfy as peer + dev deps          |
| `packages/rxfy-server/src/resource.ts`               | `defineResource`, `Resource`, `primaryKeyColumn` |
| `packages/rxfy-server/src/resource-registry.ts`      | `createResourceRegistry`, `ResourceRegistry`     |
| `packages/rxfy-server/src/index.ts`                  | Barrel (add the two new modules)                 |
| `packages/rxfy-server/src/resource.test.ts`          | Tests for derivation + PK detection              |
| `packages/rxfy-server/src/resource-registry.test.ts` | Tests for the registry                           |

---

## Task 1: Add dependencies

**Files:**

- Modify: `packages/rxfy-server/package.json`

- [ ] **Step 1: Add `peerDependencies` and the new `devDependencies`**

Edit `packages/rxfy-server/package.json`. Add a `peerDependencies` block (place it right before `publishConfig`) and extend `devDependencies`. After the edit those two sections must read EXACTLY:

```json
  "peerDependencies": {
    "drizzle-orm": "^0.45.0",
    "drizzle-zod": "^0.8.0",
    "rxfy": "^1.0.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@vanya2h/eslint-config": "^0.7.0",
    "@vanya2h/typescript-config": "^0.7.0",
    "drizzle-orm": "^0.45.2",
    "drizzle-zod": "^0.8.3",
    "eslint": "^9.27.0",
    "jiti": "^2.4.2",
    "rimraf": "^6.0.1",
    "rxfy": "workspace:*",
    "tsup": "^8.5.0",
    "vitest": "^3.1.4",
    "zod": "^4.4.3"
  },
```

(Leave all other fields untouched. These peers are externalized by tsup at build time; the dev versions resolve them for local build/test.)

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: resolves drizzle-orm 0.45.x, drizzle-zod 0.8.x, zod 4.4.x; links `rxfy` from the workspace. Peer-dependency warnings (if any) are acceptable; there must be no install error.

- [ ] **Step 3: Confirm the package still builds/tests green (no source change yet)**

Run: `pnpm --filter rxfy-server build && pnpm --filter rxfy-server test && pnpm --filter rxfy-server check-types && pnpm --filter rxfy-server lint`
Expected: all pass (foundation modules unaffected).

- [ ] **Step 4: Commit**

```bash
git add packages/rxfy-server/package.json pnpm-lock.yaml
git commit -m "chore(rxfy-server): add drizzle, zod, and rxfy dependencies"
```

---

## Task 2: `resource.ts` — `defineResource` + primary-key detection

**Files:**

- Create: `packages/rxfy-server/src/resource.ts`
- Test: `packages/rxfy-server/src/resource.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-server/src/resource.test.ts`:

```ts
import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { defineResource, primaryKeyColumn } from "./resource.js";

const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  views: integer("views").notNull().default(0),
});

// Primary key on a column that is NOT named "id"
const widgets = pgTable("widgets", {
  sku: text("sku").primaryKey(),
  label: text("label").notNull(),
});

// No primary key
const logs = pgTable("logs", {
  message: text("message").notNull(),
});

// Composite primary key
const memberships = pgTable(
  "memberships",
  {
    userId: text("user_id").notNull(),
    orgId: text("org_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
);

describe("primaryKeyColumn", () => {
  it("returns the single PK column's JS name", () => {
    expect(primaryKeyColumn(posts)).toBe("id");
    expect(primaryKeyColumn(widgets)).toBe("sku");
  });

  it("throws when there is no primary key", () => {
    expect(() => primaryKeyColumn(logs)).toThrow(/primary key/i);
  });

  it("throws for a composite primary key", () => {
    expect(() => primaryKeyColumn(memberships)).toThrow(/composite|multiple|single/i);
  });
});

describe("defineResource", () => {
  it("defaults the model name to the SQL table name", () => {
    const r = defineResource({ table: posts });
    expect(r.name).toBe("posts");
    expect(r.model.name).toBe("posts");
  });

  it("honors an explicit name override", () => {
    const r = defineResource({ table: posts, name: "post" });
    expect(r.name).toBe("post");
    expect(r.model.name).toBe("post");
  });

  it("derives a getKey that reads the primary-key column", () => {
    const r = defineResource({ table: posts });
    expect(r.getKey({ id: "1", orgId: "o", title: "t", views: 0 })).toBe("1");
    expect(r.primaryKeyColumn).toBe("id");
  });

  it("supports a non-id primary key", () => {
    const r = defineResource({ table: widgets });
    expect(r.getKey({ sku: "S1", label: "L" })).toBe("S1");
    expect(r.model.getKey({ sku: "S2", label: "L2" })).toBe("S2");
  });

  it("produces a working zod v4 schema that validates rows", () => {
    const r = defineResource({ table: posts });
    const row = { id: "1", orgId: "o", title: "t", views: 5 };
    expect(r.zod.parse(row)).toEqual(row);
    expect(() => r.zod.parse({ id: "1", orgId: "o", title: "t", views: "nope" })).toThrow();
  });

  it("exposes the table on the resource", () => {
    const r = defineResource({ table: posts });
    expect(r.table).toBe(posts);
  });

  it("throws when the table has no single primary key", () => {
    expect(() => defineResource({ table: logs })).toThrow(/primary key/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `pnpm --filter rxfy-server exec vitest run src/resource.test.ts`
Expected: FAIL — cannot resolve `./resource.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/rxfy-server/src/resource.ts`:

```ts
import type { InferSelectModel } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { createModel, type ModelDescriptor } from "rxfy";
import type { z } from "zod";

/** A Drizzle table bound to an rxfy model + Zod schema + key extractor. */
export type Resource<TTable extends PgTable = PgTable, TRow = InferSelectModel<TTable>> = {
  readonly table: TTable;
  readonly name: string;
  readonly model: ModelDescriptor<TRow>;
  readonly zod: z.ZodType<TRow>;
  readonly getKey: (row: TRow) => string;
  readonly primaryKeyColumn: string;
};

/**
 * The JS property name of the table's single primary-key column.
 * Throws if there is no primary key or it is composite (single-column PK is the v1 contract).
 */
export function primaryKeyColumn(table: PgTable): string {
  const pkColumns: string[] = [];
  for (const jsKey of Object.keys(table)) {
    const column = (table as Record<string, unknown>)[jsKey] as { primary?: boolean } | undefined;
    if (column && typeof column === "object" && column.primary === true) {
      pkColumns.push(jsKey);
    }
  }
  if (pkColumns.length === 1) {
    return pkColumns[0];
  }
  if (pkColumns.length > 1) {
    throw new Error(
      `rxfy-server: table "${getTableConfig(table).name}" has multiple primary key columns; composite keys are not supported`,
    );
  }
  // No inline single-column PK; a composite primaryKey(...) shows up in getTableConfig.primaryKeys.
  const { name, primaryKeys } = getTableConfig(table);
  if (primaryKeys.length > 0) {
    throw new Error(`rxfy-server: table "${name}" has a composite primary key; only single-column keys are supported`);
  }
  throw new Error(`rxfy-server: table "${name}" has no primary key`);
}

/** Derive a resource (rxfy model + Zod + getKey) from a Drizzle table. No codegen. */
export function defineResource<TTable extends PgTable>(config: { table: TTable; name?: string }): Resource<TTable> {
  type TRow = InferSelectModel<TTable>;

  const pk = primaryKeyColumn(config.table);
  const name = config.name ?? getTableConfig(config.table).name;
  // drizzle-zod's output type and InferSelectModel agree at runtime (verified); bridge the nominal gap.
  const zod = createSelectSchema(config.table) as unknown as z.ZodType<TRow>;
  const getKey = (row: TRow): string => String((row as Record<string, unknown>)[pk]);
  const model = createModel<TRow, string>({ schema: zod, getKey, name });

  return { table: config.table, name, model, zod, getKey, primaryKeyColumn: pk };
}
```

> If TypeScript reports a type error on the `createModel<TRow, string>({ schema: zod, ... })` call due to zod/drizzle-zod generic friction, the runtime behavior is correct (verified against drizzle-zod 0.8.3 + zod 4.4.3); resolve it ONLY by adjusting the `as unknown as z.ZodType<TRow>` cast or the explicit `createModel` generics — do NOT change the runtime logic. Report the exact final types in your handoff.

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `pnpm --filter rxfy-server exec vitest run src/resource.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Lint, type-check, commit**

Run `pnpm --filter rxfy-server lint` (lint:fix then re-lint if needed) and `pnpm --filter rxfy-server check-types` (exit 0).

```bash
git add packages/rxfy-server/src/resource.ts packages/rxfy-server/src/resource.test.ts
git commit -m "feat(rxfy-server): add defineResource with Drizzle->rxfy model derivation"
```

---

## Task 3: `resource-registry.ts` — `createResourceRegistry`

**Files:**

- Create: `packages/rxfy-server/src/resource-registry.ts`
- Test: `packages/rxfy-server/src/resource-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-server/src/resource-registry.test.ts`:

```ts
import { pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { defineResource } from "./resource.js";
import { createResourceRegistry } from "./resource-registry.js";

const posts = pgTable("posts", { id: text("id").primaryKey(), title: text("title").notNull() });
const users = pgTable("users", { id: text("id").primaryKey(), name: text("name").notNull() });

const postResource = defineResource({ table: posts, name: "post" });
const userResource = defineResource({ table: users, name: "user" });

describe("createResourceRegistry", () => {
  it("looks resources up by name", () => {
    const reg = createResourceRegistry([postResource, userResource]);
    expect(reg.byName("post")).toBe(postResource);
    expect(reg.byName("user")).toBe(userResource);
    expect(reg.byName("missing")).toBeUndefined();
  });

  it("exposes the model by name", () => {
    const reg = createResourceRegistry([postResource]);
    expect(reg.model("post")).toBe(postResource.model);
    expect(reg.model("missing")).toBeUndefined();
  });

  it("lists all resources", () => {
    const reg = createResourceRegistry([postResource, userResource]);
    expect(reg.all()).toEqual([postResource, userResource]);
  });

  it("throws on duplicate resource names", () => {
    expect(() => createResourceRegistry([postResource, postResource])).toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `pnpm --filter rxfy-server exec vitest run src/resource-registry.test.ts`
Expected: FAIL — cannot resolve `./resource-registry.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/rxfy-server/src/resource-registry.ts`:

```ts
import type { ModelDescriptor } from "rxfy";
import type { Resource } from "./resource.js";

/** Indexes resources by name for server writes and client live wiring. */
export type ResourceRegistry = {
  byName: (name: string) => Resource | undefined;
  model: (name: string) => ModelDescriptor<unknown> | undefined;
  all: () => Resource[];
};

export function createResourceRegistry(resources: Resource[]): ResourceRegistry {
  const byName = new Map<string, Resource>();
  for (const resource of resources) {
    if (byName.has(resource.name)) {
      throw new Error(`rxfy-server: duplicate resource name "${resource.name}"`);
    }
    byName.set(resource.name, resource);
  }
  return {
    byName: (name) => byName.get(name),
    model: (name) => byName.get(name)?.model,
    all: () => [...byName.values()],
  };
}
```

> If `Resource` (defaulting its generics) does not accept the specific `Resource<typeof posts>` returned by `defineResource` without complaint, widen the array parameter to `Resource<PgTable>[]` or `Resource<any>[]` (import `PgTable` from `drizzle-orm/pg-core`) — keep the runtime logic identical. Report the final type used.

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `pnpm --filter rxfy-server exec vitest run src/resource-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, type-check, commit**

Run `pnpm --filter rxfy-server lint` (lint:fix if needed) and `pnpm --filter rxfy-server check-types`.

```bash
git add packages/rxfy-server/src/resource-registry.ts packages/rxfy-server/src/resource-registry.test.ts
git commit -m "feat(rxfy-server): add createResourceRegistry"
```

---

## Task 4: Barrel export + full verification

**Files:**

- Modify: `packages/rxfy-server/src/index.ts`

- [ ] **Step 1: Update the barrel**

Overwrite `packages/rxfy-server/src/index.ts`:

```ts
export * from "./resource-registry.js";
export * from "./resource.js";
export * from "./state-channel.js";
export * from "./topic-key.js";
```

(If `simple-import-sort/exports` reorders, keep the autofixed order.)

- [ ] **Step 2: Full package verification**

Run: `pnpm --filter rxfy-server test && pnpm --filter rxfy-server build && pnpm --filter rxfy-server check-types && pnpm --filter rxfy-server lint`
Expected: all tests pass (foundation + resource + registry); build emits `dist/index.{js,cjs,d.ts,d.cts}`; check-types exit 0; lint clean.

- [ ] **Step 3: Verify the built surface against a real table**

Run from repo root:

```bash
node --input-type=module -e "
import('drizzle-orm/pg-core').then(async d => {
  const m = await import('./packages/rxfy-server/dist/index.js');
  const t = d.pgTable('posts', { id: d.text('id').primaryKey(), title: d.text('title').notNull() });
  const r = m.defineResource({ table: t });
  console.log(r.name, r.primaryKeyColumn, r.getKey({ id: 'x', title: 'y' }));
  const reg = m.createResourceRegistry([r]);
  console.log(typeof reg.model('posts').getKey);
})"
```

Expected output (two lines):

- `posts id x`
- `function`

- [ ] **Step 4: Commit**

```bash
git add packages/rxfy-server/src/index.ts
git commit -m "feat(rxfy-server): export resource and resource-registry"
```

---

## Task 5: Changeset

**Files:**

- Create: `.changeset/rxfy-server-resource.md`

- [ ] **Step 1: Create the changeset**

Create `.changeset/rxfy-server-resource.md`:

```md
---
"rxfy-server": minor
---

Add `defineResource` (derive an rxfy model + Zod schema + key extractor from a Drizzle table, no codegen) and `createResourceRegistry` (index resources by name).
```

- [ ] **Step 2: Verify**

Run: `pnpm changeset status`
Expected: lists `rxfy-server` at `minor` with no errors.

- [ ] **Step 3: Commit**

```bash
git add .changeset/rxfy-server-resource.md
git commit -m "chore(rxfy-server): add resource changeset"
```

---

## Final Verification

- [ ] Run: `pnpm turbo build test lint check-types --filter=rxfy-server`
      Expected: all four tasks succeed.

---

## Self-Review Notes

- **Spec coverage:** §5.1 `defineResource` (drizzle-zod `createSelectSchema` for the schema; PK detection; `getKey`; default name from `getTableConfig(table).name`; wraps `createModel`) and `createResourceRegistry` (name → resource/model, duplicate rejection). Composite/no PK throw (single-column PK contract). Resource-level `channels` deliberately omitted (invalidation lives on the state side via the already-built `invalidationChannel`).
- **Verified API (sandbox probe):** drizzle-orm 0.45.2 / drizzle-zod 0.8.3 / zod 4.4.3. `createSelectSchema(table)` returns a native zod v4 schema; schema keys and `InferSelectModel` keys are JS camelCase names; `column.primary === true` detects single-column PKs; `getTableConfig(table).name` is the SQL table name; composite PKs surface in `getTableConfig(table).primaryKeys`.
- **Known type soft-spot:** the drizzle-zod schema type is bridged to `z.ZodType<TRow>` via a documented cast; the two `> If TypeScript…` notes give the implementer latitude to adjust ONLY type annotations/casts (never runtime logic), with tests pinning behavior.
- **Out of scope (later plans):** hub + `update`/`create`/`delete` + `touch` + `grant` (Plan 4), `rxfy-ws` (Plan 5), client wiring + `rxfy-react` + rxfy-core `window` (Plan 6).
- **Type consistency:** `defineResource(config): Resource<TTable>`; `Resource` has `{ table, name, model, zod, getKey, primaryKeyColumn }`; `createResourceRegistry(resources): ResourceRegistry` with `byName`/`model`/`all`. Plan 4's `createServer`/writes consume `Resource` + `ResourceRegistry`.
