# Storage Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple the live server's write path from Drizzle by introducing a generic `LiveStorage<TBinding>` port in the core, shipping Drizzle and in-memory persistence as separate `rxfy-server-drizzle` / `rxfy-server-memory` packages.

**Architecture:** Core (`rxfy-server`) keeps the hub, grant issuer, publish logic, a neutral `Resource<TInsert, TRow, TBinding>`, the `LiveStorage<TBinding>` port, and `createLive<TBinding>({ storage, hub, secret })`. Persistence moves behind the port; each adapter package owns its `defineResource`/`defineCollection` (type source) + a `LiveStorage` impl. Core drops `drizzle-orm`.

**Tech Stack:** TypeScript, pnpm workspaces + Turbo, tsup (dual ESM/CJS), Vitest 3, Drizzle ORM + drizzle-zod (drizzle adapter only), pglite (drizzle tests).

**Spec:** [docs/superpowers/specs/2026-07-13-storage-adapters-design.md](../specs/2026-07-13-storage-adapters-design.md)

**Base branch:** This is a **breaking refactor for its own PR**, built on top of the entity-grants work (it composes `createGrantIssuer` and assumes the collapsed grant flow). Branch from `feat/grantless` (or `develop` once entity-grants has merged). Do not start on `main`.

**Convention reminders:** Prettier — 120 width, double quotes, semicolons, trailing commas. Import order enforced by `simple-import-sort` (run `pnpm --filter <pkg> lint --fix` to auto-sort). Commit messages: no `Co-Authored-By` trailer. After public API changes to published packages, add a changeset (Task 12).

**Cross-package note:** This restructures a published package and adds two. Intermediate tasks keep each package's own tests green; the workspace typecheck is red until migrations land. **Task 12** runs the full `turbo build/check-types/test/lint` and must end green.

---

## File Structure

**`rxfy-server` (core) — after:**

- `src/storage.ts` (new) — `LiveStorage<TBinding>` port + neutral `Resource<TInsert, TRow, TBinding>` type.
- `src/live.ts` (new, replaces `server.ts`) — `createLive<TBinding>` + `Live<TBinding>` + `LiveConfig<TBinding>` + `WriteOpts`.
- `src/resource-registry.ts` (modified) — retyped over the neutral `Resource`.
- `src/index.ts` (modified) — export storage/live/registry/grant/hub/hydration/state-channel; drop the `./hub` and `./browser` split (core is now drizzle-free, one entry).
- **Deleted:** `src/resource.ts` (moves to drizzle adapter), `src/server.ts` (→ `live.ts`), `src/hub-entry.ts` + `src/browser.ts` (subpaths collapse into the main entry).

**`rxfy-server-drizzle` (new package):**

- `src/resource.ts` — `defineResource`, `primaryKeyColumn`, `DrizzleBinding`.
- `src/storage.ts` — `drizzleStorage(db)`.
- `src/index.ts` — barrel.
- scaffold: `package.json`, `tsup.config.ts`, `config.ts`, `tsconfig.json`, `eslint.config.ts`, `vitest.config.ts`.

**`rxfy-server-memory` (new package):**

- `src/collection.ts` — `defineCollection`, `MemoryBinding`.
- `src/storage.ts` — `memoryStorage()`.
- `src/index.ts` — barrel.
- scaffold: same set.

---

## Task 1: Core — the `LiveStorage` port + neutral `Resource`

**Files:**

- Create: `packages/rxfy-server/src/storage.ts`
- Test: `packages/rxfy-server/src/storage.test.ts`

- [ ] **Step 1: Write the type-level test**

`storage.test.ts` (a compile-only assertion — vitest runs it as an empty suite; `check-types` is the real gate):

```ts
import type { ModelDescriptor } from "rxfy";
import { describe, expectTypeOf, it } from "vitest";
import type { LiveStorage, Resource } from "./storage.js";

describe("storage types", () => {
  it("Resource carries insert/row/binding params", () => {
    type R = Resource<{ id: string }, { id: string; n: number }, { tag: "x" }>;
    expectTypeOf<R["binding"]>().toEqualTypeOf<{ tag: "x" }>();
    expectTypeOf<R["getKey"]>().toEqualTypeOf<(row: { id: string; n: number }) => string>();
    expectTypeOf<R["model"]>().toEqualTypeOf<ModelDescriptor<{ id: string; n: number }>>();
  });

  it("LiveStorage is generic over the binding", () => {
    expectTypeOf<LiveStorage<{ tag: "x" }>["create"]>().parameter(0).toEqualTypeOf<{ tag: "x" }>();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter rxfy-server check-types`
Expected: FAIL — `Cannot find module './storage.js'`.

- [ ] **Step 3: Implement `storage.ts`**

```ts
import type { ModelDescriptor } from "rxfy";

/**
 * A storage-neutral live resource: the client-facing model + key extractor, plus an opaque
 * `binding` that only its adapter understands. `TInsert` types the create/update payloads; `TRow`
 * the persisted row; `TBinding` is uniform per adapter and matched against the storage.
 */
export type Resource<TInsert = unknown, TRow = unknown, TBinding = unknown> = {
  /** Topic namespace / rxfy model name — live patches publish under this. */
  name: string;
  /** The rxfy model for the client store / live routing. */
  model: ModelDescriptor<TRow>;
  /** Extract the entity key from a row (for the patch topic). */
  getKey: (row: TRow) => string;
  /** Adapter-specific handle (a Drizzle table binding, an in-memory Map, …). Opaque to core. */
  binding: TBinding;
  /** Phantom — types the insert shape for create/update. Never read at runtime. */
  readonly _insert?: TInsert;
};

/**
 * The persistence port. Generic over the binding so a storage accepts only its own adapter's
 * resources. Row/values payloads stay `unknown` here (a generic storage can't know them); their
 * precise types live on the `Resource` generics and surface through `Live`'s write methods.
 */
export type LiveStorage<TBinding = unknown> = {
  /** Insert values, return the persisted row. Throws on failure (a store bug). */
  create(binding: TBinding, values: unknown): Promise<unknown>;
  /** Update the row by id, return it — or undefined when no row matches (not found). */
  update(binding: TBinding, id: string, values: unknown): Promise<unknown | undefined>;
  /** Delete the row by id. */
  delete(binding: TBinding, id: string): Promise<void>;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter rxfy-server check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-server/src/storage.ts packages/rxfy-server/src/storage.test.ts
git commit -m "feat(rxfy-server): add LiveStorage port and neutral Resource type"
```

---

## Task 2: Core — `createLive` over the storage port

Replaces `server.ts`. The writers persist via the port then publish/touch; grant methods come from the composed issuer.

**Files:**

- Create: `packages/rxfy-server/src/live.ts`
- Create: `packages/rxfy-server/src/live.test.ts`
- Delete (Step 6): `packages/rxfy-server/src/server.ts`, `packages/rxfy-server/src/server.test.ts`

- [ ] **Step 1: Write the failing test**

`live.test.ts` — a fake storage drives the writers; assert persistence delegation + publish:

```ts
import { createModel, createModelRegistry } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGrantIssuer } from "./grant-issuer.js";
import { channelSubscription, createInMemoryHub, entitySubscription } from "./hub.js";
import { createLive } from "./live.js";
import type { LiveStorage, Resource } from "./storage.js";
import { touch } from "./state-channel.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

type Binding = { name: string };
const posts: Resource<{ id: string; title: string }, { id: string; title: string }, Binding> = {
  name: "post",
  model: postModel,
  getKey: (r) => r.id,
  binding: { name: "post" },
};

function fakeStorage(): LiveStorage<Binding> {
  return {
    create: vi.fn(async (_b, values) => values),
    update: vi.fn(async (_b, id, values) => ({ id, title: "x", ...(values as object) })),
    delete: vi.fn(async () => {}),
  };
}

describe("createLive", () => {
  it("create persists via storage and publishes a patch on the entity topic", async () => {
    const hub = createInMemoryHub();
    const seen: unknown[] = [];
    hub.onPublish((_c, m) => seen.push(m));
    hub.subscribe(1, [entitySubscription("post", "p1")], Date.now() + 60_000);
    const live = createLive({ storage: fakeStorage(), hub, secret: "s" });

    const row = await live.create(posts, { id: "p1", title: "Hi" });
    expect(row).toEqual({ id: "p1", title: "Hi" });
    expect(seen).toEqual([{ v: 2, kind: "patch", name: "post", id: "p1", data: { id: "p1", title: "Hi" } }]);
  });

  it("update returning undefined publishes nothing", async () => {
    const hub = createInMemoryHub();
    const seen: unknown[] = [];
    hub.onPublish((_c, m) => seen.push(m));
    const storage: LiveStorage<Binding> = { ...fakeStorage(), update: async () => undefined };
    const live = createLive({ storage, hub, secret: "s" });
    expect(await live.update(posts, "nope", { title: "x" })).toBeUndefined();
    expect(seen).toEqual([]);
  });

  it("touch publishes a stale on the channel", async () => {
    const hub = createInMemoryHub();
    const seen: unknown[] = [];
    hub.onPublish((_c, m) => seen.push(m));
    hub.subscribe(1, [channelSubscription("post:orgId=A")], Date.now() + 60_000);
    const live = createLive({ storage: fakeStorage(), hub, secret: "s" });
    live.touch(touch({ key: "post" }, { orgId: "A" }));
    expect(seen).toEqual([{ v: 2, kind: "stale", channel: "post:orgId=A" }]);
  });

  it("exposes the grant issuer's serve", async () => {
    const hub = createInMemoryHub();
    const live = createLive({ storage: fakeStorage(), hub, secret: "s" });
    const issuer = createGrantIssuer({ secret: "s" });
    void createModelRegistry(); // sanity import
    expect(typeof live.serve).toBe(typeof issuer.serve);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter rxfy-server test -- live`
Expected: FAIL — `Cannot find module './live.js'`.

- [ ] **Step 3: Implement `live.ts`**

```ts
import { patch, stale } from "rxfy-protocol";
import { createGrantIssuer, type GrantIssuer } from "./grant-issuer.js";
import { channelSubscription, entitySubscription, type Hub } from "./hub.js";
import type { LiveStorage, Resource } from "./storage.js";
import type { TouchTarget } from "./state-channel.js";

export type WriteOpts = { touch?: TouchTarget[] };

export type LiveConfig<TBinding> = {
  /** Persistence backend — pairs with the resources' binding type. */
  storage: LiveStorage<TBinding>;
  hub: Hub;
  /** HMAC secret for signing/verifying channel grants (required). */
  secret: string;
  /** Grant lifetime in ms. Default 15 minutes. */
  grantTtlMs?: number;
  /** Renewal grace window in ms. Default 5 minutes. */
  renewGraceMs?: number;
};

/** The live server: storage-neutral writers + the stateless grant half (serve/renew/hydration). */
export type Live<TBinding> = GrantIssuer & {
  /** Insert and publish a patch. Returns the persisted row. */
  create: <TInsert, TRow>(
    resource: Resource<TInsert, TRow, TBinding>,
    values: TInsert,
    opts?: WriteOpts,
  ) => Promise<TRow>;
  /** Update by id and publish a patch. Resolves `undefined` when no row matches (no patch/touch then). */
  update: <TInsert, TRow>(
    resource: Resource<TInsert, TRow, TBinding>,
    id: string,
    values: Partial<TInsert>,
    opts?: WriteOpts,
  ) => Promise<TRow | undefined>;
  delete: (resource: Resource<unknown, unknown, TBinding>, id: string, opts?: WriteOpts) => Promise<void>;
  touch: (...targets: TouchTarget[]) => void;
};

export function createLive<TBinding>(config: LiveConfig<TBinding>): Live<TBinding> {
  const { storage, hub } = config;
  const issuer = createGrantIssuer(config);

  const publishEntity = (name: string, id: string, row: unknown): void => {
    hub.publish(entitySubscription(name, id), patch(name, id, row));
  };
  const applyTouch = (targets: TouchTarget[] | undefined): void => {
    for (const target of targets ?? []) hub.publish(channelSubscription(target.channel), stale(target.channel));
  };

  return {
    async create(resource, values, opts) {
      const row = await storage.create(resource.binding, values);
      publishEntity(resource.name, resource.getKey(row as never), row);
      applyTouch(opts?.touch);
      return row as never;
    },
    async update(resource, id, values, opts) {
      const row = await storage.update(resource.binding, id, values);
      if (row === undefined) return undefined; // not found — nothing written, publish nothing
      publishEntity(resource.name, id, row);
      applyTouch(opts?.touch);
      return row as never;
    },
    async delete(resource, id, opts) {
      await storage.delete(resource.binding, id);
      applyTouch(opts?.touch);
    },
    touch: (...targets) => applyTouch(targets),
    serve: issuer.serve,
    renew: issuer.renew,
    hydration: issuer.hydration,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter rxfy-server test -- live`
Expected: PASS.

- [ ] **Step 5: Delete the old server module**

```bash
git rm packages/rxfy-server/src/server.ts packages/rxfy-server/src/server.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/rxfy-server/src/live.ts packages/rxfy-server/src/live.test.ts
git commit -m "feat(rxfy-server): createLive over the storage port; drop the Drizzle writers"
```

---

## Task 3: Core — retype `ResourceRegistry`, collapse subpaths, rebuild the barrel

Core no longer depends on Drizzle, so the `./hub` and `./browser` subpaths (which existed only to avoid the Drizzle main entry) collapse into a single entry. `defineResource`/`resource.ts` move out in Task 5.

**Files:**

- Modify: `packages/rxfy-server/src/resource-registry.ts`
- Modify: `packages/rxfy-server/src/index.ts`
- Delete: `packages/rxfy-server/src/hub-entry.ts`, `packages/rxfy-server/src/browser.ts`, `packages/rxfy-server/src/resource.ts`
- Modify: `packages/rxfy-server/tsup.config.ts`, `packages/rxfy-server/package.json`
- Test: `packages/rxfy-server/src/resource-registry.test.ts` (retype only)

- [ ] **Step 1: Retype `resource-registry.ts` over the neutral `Resource`**

Replace the file:

```ts
import type { Resource } from "./storage.js";

/** Any resource, regardless of its insert/row/binding types. */
export type AnyResource = Resource<any, any, any>;

/** The resource in `TResources` whose `name` is `TName` (never if absent). */
type ResourceByName<TResources extends readonly AnyResource[], TName extends string> = Extract<
  TResources[number],
  { name: TName }
>;

/** Indexes resources by name — a convenience lookup for client wiring / tests. Not required by createLive. */
export type ResourceRegistry<TResources extends readonly AnyResource[] = readonly AnyResource[]> = {
  byName: <TName extends string>(name: TName) => ResourceByName<TResources, TName> | undefined;
  model: <TName extends string>(name: TName) => ResourceByName<TResources, TName>["model"] | undefined;
  all: () => TResources[number][];
};

export function createResourceRegistry<const TResources extends readonly AnyResource[]>(
  resources: TResources,
): ResourceRegistry<TResources> {
  const byName = new Map<string, AnyResource>();
  for (const resource of resources) {
    if (byName.has(resource.name)) throw new Error(`rxfy-server: duplicate resource name "${resource.name}"`);
    byName.set(resource.name, resource);
  }
  return {
    byName: (name: string) => byName.get(name),
    model: (name: string) => byName.get(name)?.model,
    all: () => [...byName.values()],
  } as ResourceRegistry<TResources>;
}
```

Update `resource-registry.test.ts`: build resources as plain neutral objects (no `defineResource`):

```ts
import { createModel } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createResourceRegistry } from "./resource-registry.js";
import type { Resource } from "./storage.js";

const model = createModel({ schema: z.object({ id: z.string() }), getKey: (r) => r.id, name: "post" });
const post: Resource<{ id: string }, { id: string }, null> = {
  name: "post",
  model,
  getKey: (r) => r.id,
  binding: null,
};

describe("createResourceRegistry", () => {
  it("indexes by name and rejects duplicates", () => {
    const reg = createResourceRegistry([post]);
    expect(reg.byName("post")).toBe(post);
    expect(reg.all()).toEqual([post]);
    expect(() => createResourceRegistry([post, post])).toThrow(/duplicate/);
  });
});
```

- [ ] **Step 2: Delete the moved/collapsed files**

```bash
git rm packages/rxfy-server/src/hub-entry.ts packages/rxfy-server/src/browser.ts packages/rxfy-server/src/resource.ts packages/rxfy-server/src/resource.test.ts
```

- [ ] **Step 3: Rewrite `index.ts` as the single barrel**

```ts
export { type GrantClaims, signGrant, verifyGrant } from "./grant.js";
export { createGrantIssuer, type GrantIssuer, type GrantIssuerConfig } from "./grant-issuer.js";
export * from "./hub.js";
export * from "./hydration.js";
export { createLive, type Live, type LiveConfig, type WriteOpts } from "./live.js";
export * from "./resource-registry.js";
export * from "./state-channel.js";
export type { LiveStorage, Resource } from "./storage.js";
```

- [ ] **Step 4: Simplify `tsup.config.ts` to a single entry**

```ts
import path from "node:path";
import { defineConfig } from "tsup";
import { config } from "./config.js";

export default defineConfig({
  format: ["cjs", "esm"],
  dts: true,
  outDir: config.distDir,
  entry: { index: path.join(config.srcDir, "index.ts") },
});
```

- [ ] **Step 5: Update `package.json` — drop subpath exports and the Drizzle deps**

In `packages/rxfy-server/package.json`:

- Delete the `"./browser"` and `"./hub"` keys from `exports` (keep only `"."`).
- Remove `drizzle-orm` and `drizzle-zod` from both `peerDependencies` and `devDependencies`.
- Remove `@electric-sql/pglite` from `devDependencies` (Drizzle-only test dep, moves to the drizzle package).

- [ ] **Step 6: Build + test the core**

Run: `pnpm --filter rxfy-server build && pnpm --filter rxfy-server test && pnpm --filter rxfy-server check-types`
Expected: PASS (grant/hub/hydration/grant-issuer/live/storage/resource-registry suites green; no Drizzle imports remain).

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy-server
git commit -m "refactor(rxfy-server): drizzle-free core — single entry, neutral registry"
```

---

## Task 4: Scaffold `rxfy-server-drizzle`

**Files (create):** `packages/rxfy-server-drizzle/{package.json,tsup.config.ts,config.ts,tsconfig.json,eslint.config.ts,vitest.config.ts}`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "rxfy-server-drizzle",
  "version": "0.0.0",
  "description": "Drizzle/Postgres storage adapter for rxfy-server",
  "homepage": "https://rxfy.vanya2h.me",
  "bugs": { "url": "https://github.com/vanya2h/rxfy/issues" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/vanya2h/rxfy.git",
    "directory": "packages/rxfy-server-drizzle"
  },
  "license": "MIT",
  "author": "hi@vanya2h.me",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "package.json", "README.md"],
  "scripts": {
    "build": "tsup",
    "check-types": "tsc --noEmit",
    "clean": "rimraf ./dist",
    "dev": "tsup --watch --silent",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "prepublishOnly": "pnpm run build",
    "test": "vitest run --passWithNoTests"
  },
  "peerDependencies": {
    "drizzle-orm": "^0.45.0",
    "drizzle-zod": "^0.8.0",
    "rxfy": "^2.0.0",
    "rxfy-server": "workspace:*",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@electric-sql/pglite": "^0.5.3",
    "@vanya2h/eslint-config": "^0.7.0",
    "@vanya2h/typescript-config": "^0.7.0",
    "drizzle-orm": "^0.45.2",
    "drizzle-zod": "^0.8.3",
    "eslint": "^9.27.0",
    "jiti": "^2.4.2",
    "rimraf": "^6.0.1",
    "rxfy": "workspace:*",
    "rxfy-server": "workspace:*",
    "tsup": "^8.5.0",
    "vitest": "^3.1.4",
    "zod": "^4.4.3"
  },
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org" }
}
```

- [ ] **Step 2: `config.ts`, `tsup.config.ts`, `tsconfig.json`** (copy the core's shape)

`config.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "./package.json";

const currentPath = fileURLToPath(import.meta.url);
const rootDir = path.dirname(currentPath);

export const config = {
  name: pkg.name,
  rootDir,
  distDir: path.join(rootDir, "dist"),
  srcDir: path.join(rootDir, "src"),
};
```

`tsup.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "tsup";
import { config } from "./config.js";

export default defineConfig({
  format: ["cjs", "esm"],
  dts: true,
  outDir: config.distDir,
  entry: { index: path.join(config.srcDir, "index.ts") },
});
```

`tsconfig.json`:

```json
{
  "extends": "@vanya2h/typescript-config/node",
  "compilerOptions": { "types": ["vitest/globals"] },
  "exclude": ["node_modules", "dist", ".turbo"]
}
```

- [ ] **Step 3: `eslint.config.ts` and `vitest.config.ts`** (copy verbatim from `packages/rxfy-server/eslint.config.ts` and `packages/rxfy-server/vitest.config.ts`)

Run: `cp packages/rxfy-server/eslint.config.ts packages/rxfy-server-drizzle/eslint.config.ts && cp packages/rxfy-server/vitest.config.ts packages/rxfy-server-drizzle/vitest.config.ts` (then open each and fix any relative paths if present).

- [ ] **Step 4: Install to wire the workspace**

Run: `pnpm install`
Expected: `rxfy-server-drizzle` linked into the workspace; no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/rxfy-server-drizzle pnpm-lock.yaml
git commit -m "chore(rxfy-server-drizzle): scaffold package"
```

---

## Task 5: `rxfy-server-drizzle` — `defineResource` + `drizzleStorage`

Move the Drizzle code out of the old core `resource.ts` (now deleted) into the adapter.

**Files:**

- Create: `packages/rxfy-server-drizzle/src/resource.ts`
- Create: `packages/rxfy-server-drizzle/src/storage.ts`
- Create: `packages/rxfy-server-drizzle/src/index.ts`
- Test: `packages/rxfy-server-drizzle/src/storage.test.ts`

- [ ] **Step 1: Write the failing test** (pglite round-trip)

`storage.test.ts`:

```ts
import { drizzle } from "drizzle-orm/pglite";
import { pgTable, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { defineResource } from "./resource.js";
import { drizzleStorage } from "./storage.js";

const postsTable = pgTable("posts", { id: text("id").primaryKey(), title: text("title").notNull() });

async function db() {
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite();
  await client.exec(`CREATE TABLE posts (id text PRIMARY KEY, title text NOT NULL);`);
  return drizzle(client);
}

describe("drizzleStorage", () => {
  it("create / update / delete round-trip through the binding", async () => {
    const storage = drizzleStorage(await db());
    const posts = defineResource({ table: postsTable });

    const created = await storage.create(posts.binding, { id: "p1", title: "Hi" });
    expect(created).toMatchObject({ id: "p1", title: "Hi" });

    const updated = await storage.update(posts.binding, "p1", { title: "New" });
    expect(updated).toMatchObject({ id: "p1", title: "New" });

    expect(await storage.update(posts.binding, "nope", { title: "x" })).toBeUndefined();

    await storage.delete(posts.binding, "p1");
    expect(await storage.update(posts.binding, "p1", { title: "y" })).toBeUndefined();
  });

  it("defineResource derives the model + binding", () => {
    const posts = defineResource({ table: postsTable });
    expect(posts.name).toBe("posts");
    expect(posts.getKey({ id: "p1", title: "x" })).toBe("p1");
    expect(posts.binding.pkColumn).toBe("id");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter rxfy-server build && pnpm --filter rxfy-server-drizzle test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `resource.ts`** (moved + adapted from the old core `resource.ts`)

```ts
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { createModel, type ModelDescriptor } from "rxfy";
import type { Resource } from "rxfy-server";
import type { z } from "zod";

/** The uniform Drizzle binding — a table + its single-column primary key. */
export type DrizzleBinding = { table: PgTable; pkColumn: string };

/** JS property name of the table's single primary-key column. Throws on none/composite. */
export function primaryKeyColumn(table: PgTable): string {
  const pkColumns: string[] = [];
  for (const jsKey of Object.keys(table)) {
    const column = (table as unknown as Record<string, unknown>)[jsKey] as { primary?: boolean } | undefined;
    if (column && typeof column === "object" && column.primary === true) pkColumns.push(jsKey);
  }
  if (pkColumns.length === 1) return pkColumns[0]!;
  const { name, primaryKeys } = getTableConfig(table);
  if (pkColumns.length > 1 || primaryKeys.length > 0) {
    throw new Error(
      `rxfy-server-drizzle: table "${name}" has a composite primary key; only single-column keys are supported`,
    );
  }
  throw new Error(`rxfy-server-drizzle: table "${name}" has no primary key`);
}

/** Derive a resource from a Drizzle table, or bind the table to a pre-made rxfy `model`. No codegen. */
export function defineResource<TTable extends PgTable, TRow = InferSelectModel<TTable>>(config: {
  table: TTable;
  name?: string;
  model?: ModelDescriptor<TRow>;
}): Resource<InferInsertModel<TTable>, TRow, DrizzleBinding> {
  const pkColumn = primaryKeyColumn(config.table);
  const name = config.name ?? config.model?.name ?? getTableConfig(config.table).name;
  const binding: DrizzleBinding = { table: config.table, pkColumn };

  if (config.model) {
    warnNameMismatch(name, config.model.name);
    return { name, model: config.model, getKey: config.model.getKey as (row: TRow) => string, binding };
  }
  const zod = createSelectSchema(config.table) as unknown as z.ZodType<TRow, any>;
  const getKey = (row: TRow): string => String((row as Record<string, unknown>)[pkColumn]);
  const model = createModel<TRow, string>({ schema: zod, getKey, name });
  return { name, model, getKey, binding };
}

// eslint-disable-next-line turbo/no-undeclared-env-vars
const isDev = (): boolean => process.env.NODE_ENV !== "production";
function warnNameMismatch(name: string, modelName: string): void {
  if (isDev() && name !== modelName) {
    console.warn(
      `rxfy-server-drizzle: resource "${name}" has a different model name "${modelName}"; ` +
        `live entity patches publish under the resource name and will not route to the model store`,
    );
  }
}
```

- [ ] **Step 4: Implement `storage.ts`**

```ts
import { eq } from "drizzle-orm";
import { getTableColumns, type PgColumn, type PgDatabase } from "drizzle-orm/pg-core";
import type { LiveStorage } from "rxfy-server";
import type { DrizzleBinding } from "./resource.js";

const pkCol = (binding: DrizzleBinding): PgColumn => getTableColumns(binding.table)[binding.pkColumn] as PgColumn;

/** A `LiveStorage` backed by a Drizzle Postgres database. Pair with `defineResource` resources. */
export function drizzleStorage(db: PgDatabase<any, any, any>): LiveStorage<DrizzleBinding> {
  return {
    async create(binding, values) {
      const rows = await db
        .insert(binding.table)
        .values(values as never)
        .returning();
      const row = (rows as unknown[])[0];
      if (row === undefined) throw new Error("rxfy-server-drizzle: insert returned no row");
      return row;
    },
    async update(binding, id, values) {
      const rows = await db
        .update(binding.table)
        .set(values as never)
        .where(eq(pkCol(binding), id))
        .returning();
      return (rows as unknown[])[0]; // undefined when no row matched
    },
    async delete(binding, id) {
      await db.delete(binding.table).where(eq(pkCol(binding), id));
    },
  };
}
```

- [ ] **Step 5: Implement `index.ts`**

```ts
export { type DrizzleBinding, defineResource, primaryKeyColumn } from "./resource.js";
export { drizzleStorage } from "./storage.js";
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter rxfy-server-drizzle test && pnpm --filter rxfy-server-drizzle check-types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy-server-drizzle/src
git commit -m "feat(rxfy-server-drizzle): defineResource + drizzleStorage adapter"
```

---

## Task 6: Scaffold `rxfy-server-memory`

Same scaffold as Task 4, zero runtime deps.

**Files (create):** `packages/rxfy-server-memory/{package.json,tsup.config.ts,config.ts,tsconfig.json,eslint.config.ts,vitest.config.ts}`

- [ ] **Step 1: `package.json`** (no drizzle/pglite)

```json
{
  "name": "rxfy-server-memory",
  "version": "0.0.0",
  "description": "In-memory storage adapter for rxfy-server",
  "homepage": "https://rxfy.vanya2h.me",
  "bugs": { "url": "https://github.com/vanya2h/rxfy/issues" },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/vanya2h/rxfy.git",
    "directory": "packages/rxfy-server-memory"
  },
  "license": "MIT",
  "author": "hi@vanya2h.me",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "package.json", "README.md"],
  "scripts": {
    "build": "tsup",
    "check-types": "tsc --noEmit",
    "clean": "rimraf ./dist",
    "dev": "tsup --watch --silent",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "prepublishOnly": "pnpm run build",
    "test": "vitest run --passWithNoTests"
  },
  "peerDependencies": { "rxfy": "^2.0.0", "rxfy-server": "workspace:*" },
  "devDependencies": {
    "@vanya2h/eslint-config": "^0.7.0",
    "@vanya2h/typescript-config": "^0.7.0",
    "eslint": "^9.27.0",
    "jiti": "^2.4.2",
    "rimraf": "^6.0.1",
    "rxfy": "workspace:*",
    "rxfy-server": "workspace:*",
    "tsup": "^8.5.0",
    "vitest": "^3.1.4",
    "zod": "^4.4.3"
  },
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org" }
}
```

- [ ] **Step 2: config/tsup/tsconfig/eslint/vitest** — identical to Task 4 Steps 2–3 but under `packages/rxfy-server-memory/` (change nothing but the directory).

- [ ] **Step 3: Install + commit**

```bash
pnpm install
git add packages/rxfy-server-memory pnpm-lock.yaml
git commit -m "chore(rxfy-server-memory): scaffold package"
```

---

## Task 7: `rxfy-server-memory` — `defineCollection` + `memoryStorage`

**Files:**

- Create: `packages/rxfy-server-memory/src/collection.ts`
- Create: `packages/rxfy-server-memory/src/storage.ts`
- Create: `packages/rxfy-server-memory/src/index.ts`
- Test: `packages/rxfy-server-memory/src/storage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { createModel } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection } from "./collection.js";
import { memoryStorage } from "./storage.js";

const model = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

describe("memoryStorage + defineCollection", () => {
  it("create / update / delete mutate the collection map", async () => {
    const posts = defineCollection({ name: "post", model, seed: [{ id: "p0", title: "seed" }] });
    const storage = memoryStorage();
    expect(posts.all()).toEqual([{ id: "p0", title: "seed" }]);

    const created = await storage.create(posts.binding, { id: "p1", title: "Hi" });
    expect(created).toEqual({ id: "p1", title: "Hi" });
    expect(posts.get("p1")).toEqual({ id: "p1", title: "Hi" });

    const updated = await storage.update(posts.binding, "p1", { title: "New" });
    expect(updated).toEqual({ id: "p1", title: "New" });
    expect(await storage.update(posts.binding, "nope", { title: "x" })).toBeUndefined();

    await storage.delete(posts.binding, "p1");
    expect(posts.get("p1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter rxfy-server build && pnpm --filter rxfy-server-memory test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `collection.ts`**

```ts
import type { ModelDescriptor } from "rxfy";
import type { Resource } from "rxfy-server";

/** The uniform in-memory binding — the backing map + key extractor (row type erased). */
export type MemoryBinding = { rows: Map<string, unknown>; getKey: (row: unknown) => string };

/** An in-memory collection: a `Resource` whose binding IS its data map, plus `all`/`get` reads. */
export type Collection<TRow> = Resource<TRow, TRow, MemoryBinding> & {
  all: () => TRow[];
  get: (id: string) => TRow | undefined;
};

export function defineCollection<TRow>(config: {
  name: string;
  model: ModelDescriptor<TRow>;
  seed?: TRow[];
}): Collection<TRow> {
  const rows = new Map<string, TRow>();
  const getKey = config.model.getKey;
  for (const row of config.seed ?? []) rows.set(getKey(row), row);
  const binding: MemoryBinding = { rows: rows as Map<string, unknown>, getKey: getKey as (row: unknown) => string };
  return {
    name: config.name,
    model: config.model,
    getKey,
    binding,
    all: () => [...rows.values()],
    get: (id) => rows.get(id),
  };
}
```

- [ ] **Step 4: Implement `storage.ts`**

```ts
import type { LiveStorage } from "rxfy-server";
import type { MemoryBinding } from "./collection.js";

/** A `LiveStorage` over in-memory `defineCollection` maps. Stateless — the data lives in each binding. */
export function memoryStorage(): LiveStorage<MemoryBinding> {
  return {
    async create(binding, values) {
      binding.rows.set(binding.getKey(values), values);
      return values;
    },
    async update(binding, id, values) {
      const existing = binding.rows.get(id);
      if (existing === undefined) return undefined;
      const row = { ...(existing as object), ...(values as object) };
      binding.rows.set(id, row);
      return row;
    },
    async delete(binding, id) {
      binding.rows.delete(id);
    },
  };
}
```

- [ ] **Step 5: Implement `index.ts`**

```ts
export { type Collection, type MemoryBinding, defineCollection } from "./collection.js";
export { memoryStorage } from "./storage.js";
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm --filter rxfy-server-memory test && pnpm --filter rxfy-server-memory check-types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/rxfy-server-memory/src
git commit -m "feat(rxfy-server-memory): defineCollection + memoryStorage adapter"
```

---

## Task 8: Migrate the Drizzle examples + template to `createLive` + `drizzleStorage`

Canonical transform (identical shape everywhere); apply per file below.

**Resource module** (e.g. `examples/vite-blog-framework/src/blog/resources.ts`):

- `import { createResourceRegistry, defineResource } from "rxfy-server/browser"` → `import { createResourceRegistry } from "rxfy-server"` + `import { defineResource } from "rxfy-server-drizzle"`.

**Live module** (e.g. `examples/vite-blog-framework/server/live.ts`):

- `import { createInMemoryHub, createServer } from "rxfy-server"` → `import { createInMemoryHub, createLive } from "rxfy-server"` + `import { drizzleStorage } from "rxfy-server-drizzle"`.
- `createServer({ db, resources, hub, secret })` → `createLive({ storage: drizzleStorage(db), hub, secret })`. (The `resources` registry is still exported from the resource module for tests/client wiring; it just no longer goes into the live factory.)

**Files & their `package.json` (add deps `rxfy-server-drizzle: workspace:*`):**

- `examples/vite-blog-framework` — `src/blog/resources.ts`, `server/live.ts`, `package.json`
- `examples/waku-blog` — `src/server/live.ts` (+ its resources module; `grep -rn "defineResource\|createServer\|rxfy-server/browser" examples/waku-blog/src`), `package.json`
- `examples/vite-ssr-pagination` — `server.ts` (+ resources), `package.json`
- `templates/vite` — `server/live.ts`, `server/index.ts` (grep for `createServer`/`defineResource`), resources module, `package.json`

- [ ] **Step 1: For each package above, apply the transform** using the greps to locate the exact lines, then `pnpm install` to link the new dep.

- [ ] **Step 2: Verify each migrated package**

Run (per package): `pnpm --filter <pkg> check-types && pnpm --filter <pkg> test`
Expected: PASS — the smoke tests (`serve → grant → subscribe → live.update → patch`) exercise the Drizzle adapter end-to-end.

- [ ] **Step 3: Commit**

```bash
git add examples/vite-blog-framework examples/waku-blog examples/vite-ssr-pagination templates/vite pnpm-lock.yaml
git commit -m "refactor(examples): Drizzle examples use createLive + drizzleStorage"
```

---

## Task 9: Migrate the in-memory examples to `rxfy-server-memory`

`rr7-blog` and `next-blog` currently hand-roll an in-memory store (`store.ts`) plus a bare-hub `issuer`. Replace the store's write side with `defineCollection` + `memoryStorage`, and swap the bare-hub `createGrantIssuer` for `createLive` (which now works without Drizzle).

**Per example** (`examples/rr7-blog/app/server/`, `examples/next-blog/src/server/`):

- Add dep `rxfy-server-memory: workspace:*` to `package.json`.
- Define collections for each model (post/user/comment) via `defineCollection({ name, model, seed })`, keyed off the shared models in `examples-shared/data`.
- `store.ts` reads (`listPosts`, `getPostDetail`, `addComment`) read from the collections' `all()`/`get()`; writes go through `live.create/update/delete`.
- `live.ts`: replace `createGrantIssuer(...)` + hand-rolled `touchState` with:
  ```ts
  import { createLive, createInMemoryHub, touch, type Hub } from "rxfy-server";
  import { memoryStorage } from "rxfy-server-memory";
  export const hub: Hub = (globalForHub.__hub ??= createInMemoryHub());
  export const live = createLive({ storage: memoryStorage(), hub, secret: SECRET });
  export const touchState = (state, params) => live.touch(touch(state, params));
  ```
- `app.ts` / `entry.server.tsx`: `issuer.serve` → `live.serve`, `issuer.renew` → `live.renew`, `issuer.hydration` → `live.hydration`; writes call `live.create/update/delete(collection, …)`.

- [ ] **Step 1: Apply the transform** for `rr7-blog`, then `next-blog`, using `grep -rn "issuer\.\|store\.\|createGrantIssuer\|defineResource" examples/rr7-blog examples/next-blog` to find every site.

- [ ] **Step 2: Verify**

Run: `pnpm --filter rxfy-example-rr7-blog --filter rxfy-example-next-blog check-types && pnpm --filter rxfy-example-rr7-blog --filter rxfy-example-next-blog test`
Expected: PASS — SSR + live smoke tests (`serve → grant → subscribe → live.update → patch`) run through the memory adapter.

- [ ] **Step 3: Commit**

```bash
git add examples/rr7-blog examples/next-blog pnpm-lock.yaml
git commit -m "refactor(examples): in-memory examples use rxfy-server-memory + createLive"
```

---

## Task 10: Docs + skills

- [ ] **Step 1: Update references**

Run `grep -rn "createServer\|rxfy-server/hub\|rxfy-server/browser\|GrantSpec\|defineResource" apps/docs .agents/skills` and update:

- `createServer(...)` → `createLive({ storage, ... })`; note `db`/`resources` → `storage: drizzleStorage(db)`.
- `defineResource` now imports from `rxfy-server-drizzle`; introduce `defineCollection`/`memoryStorage` from `rxfy-server-memory`.
- Drop mentions of the `rxfy-server/hub` and `rxfy-server/browser` subpaths (core is one drizzle-free entry now).
- Do NOT touch `examples-shared`/`example-shared` references in `apps/docs` (project rule).

- [ ] **Step 2: Commit**

```bash
git add apps/docs .agents
git commit -m "docs: storage adapters — createLive + drizzle/memory adapters"
```

---

## Task 11: Changesets

- [ ] **Step 1: Write `.changeset/storage-adapters.md`**

```markdown
---
"rxfy-server": major
"rxfy-server-drizzle": major
"rxfy-server-memory": major
---

Decouple the live server from Drizzle behind a `LiveStorage<TBinding>` port.

`rxfy-server` is now storage-agnostic: `createServer({ db, resources, … })` becomes
`createLive({ storage, … })`, `Resource` is neutral (carries an opaque adapter binding), and the
`rxfy-server/hub` and `rxfy-server/browser` subpaths collapse into the single drizzle-free entry.
Drizzle ships as `rxfy-server-drizzle` (`defineResource`, `drizzleStorage`) and in-memory as
`rxfy-server-memory` (`defineCollection`, `memoryStorage`).
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/storage-adapters.md
git commit -m "chore(changeset): storage adapters"
```

---

## Task 12: Full workspace green

- [ ] **Step 1: Run the gate**

Run: `pnpm turbo build check-types test lint`
Expected: all PASS. Fix any straggler referencing `createServer`, `rxfy-server/hub`, `rxfy-server/browser`, or the old `Resource<PgTable>` shape.

- [ ] **Step 2: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "chore: workspace green after storage-adapter migration"
```

---

## Self-Review

**Spec coverage:**

- §1 `LiveStorage<TBinding>` → Task 1. §2 neutral `Resource` → Task 1. §3 `createLive<TBinding>` → Task 2. §4 drizzle adapter → Tasks 4–5. §5 memory adapter → Tasks 6–7. §6 ripple (hub subpath collapse, rename, registry, migration) → Tasks 3, 8, 9, 10. §7 type inference (compile-time binding match) → enforced by the generic signatures in Tasks 1–2, exercised by the migrated examples in Tasks 8–9. Testing section → per-adapter tests (Tasks 2, 5, 7) + end-to-end smoke via migrations (Tasks 8–9) + Task 12. Naming (unscoped) → Tasks 4, 6.
- No spec requirement is left without a task.

**Placeholder scan:** No TBD/TODO. Migration tasks (8–10) use a stated canonical transform + grep-located sites rather than repeating each example's full file — the transform and every target file/package are explicit, so no guessing is required.

**Type consistency:** `LiveStorage<TBinding>` (create/update/delete) is identical across core (Task 1), drizzle (Task 5), memory (Task 7). `Resource<TInsert, TRow, TBinding>` field names (`name`, `model`, `getKey`, `binding`, `_insert`) match across Tasks 1, 3, 5, 7. `createLive<TBinding>` / `LiveConfig<TBinding>` / `Live<TBinding>` consistent between Task 2 and the migrations. `DrizzleBinding` = `{ table, pkColumn }` and `MemoryBinding` = `{ rows, getKey }` used consistently in their adapters and storages.
