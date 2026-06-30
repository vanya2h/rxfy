# rxfy-server Hub + Write Functions + Grant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the `rxfy-server` server core: an in-memory pub/sub `Hub`, the `createServer` write functions (`update`/`create`/`delete`/`touch`) that persist via Drizzle and broadcast over the hub, and `grant` (mint hashed topic ids for a response's entities + state channels). DB-touching tests run against in-process PGlite — no external infra.

**Architecture:** The `Hub` routes opaque hashed ids → connections (pure pub/sub, no counters). `createServer({ db, resources, hub, keyer })` returns a `Live` object: `update` writes the row (`.returning()`) and publishes a `patch` on the entity topic's windowed ids; `create`/`delete` write and `touch` the affected state channels (a bare `stale` signal); `touch` and the writes derive ids via the `TopicKeyer` and publish to current+previous windows. `grant(modelRegistry, { entities, states })` reads the per-request rxfy registry for present entity ids and runs `invalidationChannel` for states, returning `{ entities: topic→id, channels: channel→id }`. Tests use `new PGlite()` per test (isolated) with `client.exec(CREATE TABLE …)`.

**Tech Stack:** TypeScript, drizzle-orm 0.45.2 (`drizzle-orm/pglite` + `drizzle-orm/pg-core`), @electric-sql/pglite 0.5.3 (dev/test only), rxfy (workspace), rxfy-protocol (workspace), Vitest. Verified PGlite facts: `new PGlite()` is in-memory + isolated, needs no `waitReady`; `drizzle(client)`; create tables with `client.exec` (snake_case columns); `.returning()` works; `timestamp` → JS `Date`; dynamic PK via `getTableColumns(table)[pkName] as PgColumn`.

This is Plan 4 of the rxfy live framework. It implements design spec §5.3 (write functions), §5.4 (hub), §5.5 (`grant`), and part of §6 from `docs/superpowers/specs/2026-06-30-rxfy-server-design.md`. Branch `feat/rxfy-server-framework` (has rxfy-protocol + rxfy-server foundation + resources).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/rxfy-server/package.json` | Add `rxfy-protocol` dep + `@electric-sql/pglite` dev dep |
| `packages/rxfy-server/src/hub.ts` | `Hub`, `ConnId`, `PublishSink`, `createInMemoryHub` |
| `packages/rxfy-server/src/test-db.ts` | Test-only PGlite helper (`createTestDb`) |
| `packages/rxfy-server/src/server.ts` | `createServer`, `Live`, `touch`, `TouchTarget`, `WriteOpts` |
| `packages/rxfy-server/src/grant.ts` | `grant` types (`GrantSpec`, `Grants`) — implemented inside server.ts, types here |
| `packages/rxfy-server/src/index.ts` | Barrel (add hub + server) |
| `packages/rxfy-server/src/hub.test.ts` | Hub pub/sub tests |
| `packages/rxfy-server/src/server.test.ts` | Write + touch + grant tests (PGlite) |

> `grant` is implemented as a method on `Live` (it needs the keyer closure), so its types live in `server.ts`; no separate `grant.ts` file is needed. The table row above lists it for clarity only.

---

## Task 1: Add dependencies

**Files:**
- Modify: `packages/rxfy-server/package.json`

- [ ] **Step 1: Add `rxfy-protocol` as a dependency and `@electric-sql/pglite` as a dev dependency**

In `packages/rxfy-server/package.json`:
- Add a `"dependencies"` block (before `"devDependencies"`):
```json
  "dependencies": {
    "rxfy-protocol": "workspace:*"
  },
```
- Add `"@electric-sql/pglite": "^0.5.3"` to `devDependencies` (keep the list alphabetically ordered: it goes first).

The `devDependencies` block becomes:
```json
  "devDependencies": {
    "@electric-sql/pglite": "^0.5.3",
    "@vanya2h/eslint-config": "^0.4.0",
    "@vanya2h/typescript-config": "^0.4.0",
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

(rxfy-protocol is a real runtime dependency — the server imports `patch`/`stale` constructors from it. tsup externalizes it. PGlite is test-only.)

- [ ] **Step 2: Install + confirm green**

Run: `pnpm install` then `pnpm --filter rxfy-server build && pnpm --filter rxfy-server test && pnpm --filter rxfy-server check-types && pnpm --filter rxfy-server lint`
Expected: resolves rxfy-protocol (workspace) + @electric-sql/pglite 0.5.x; all existing checks pass.

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-server/package.json pnpm-lock.yaml
git commit -m "chore(rxfy-server): add rxfy-protocol dep and pglite dev dep"
```

---

## Task 2: `hub.ts` — in-memory pub/sub hub

**Files:**
- Create: `packages/rxfy-server/src/hub.ts`
- Test: `packages/rxfy-server/src/hub.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-server/src/hub.test.ts`:

```ts
import { patch, type ServerMessage } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { type ConnId, createInMemoryHub } from "./hub.js";

const msg = (): ServerMessage => patch("post", "1", { id: "1" });

function collector() {
  const received: Array<{ conn: ConnId; message: ServerMessage }> = [];
  return { received, sink: (conn: ConnId, message: ServerMessage) => received.push({ conn, message }) };
}

describe("createInMemoryHub", () => {
  it("delivers a published message to subscribers of that id", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    hub.subscribe("a", ["id-1"]);
    hub.subscribe("b", ["id-1"]);
    const m = msg();
    hub.publish("id-1", m);
    expect(received).toEqual([
      { conn: "a", message: m },
      { conn: "b", message: m },
    ]);
  });

  it("does not deliver to non-subscribers", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    hub.subscribe("a", ["id-1"]);
    hub.publish("id-2", msg());
    expect(received).toEqual([]);
  });

  it("is a no-op to publish an id with no subscribers", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    expect(() => hub.publish("nobody", msg())).not.toThrow();
    expect(received).toEqual([]);
  });

  it("stops delivering after unsubscribe", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    hub.subscribe("a", ["id-1"]);
    hub.unsubscribe("a", ["id-1"]);
    hub.publish("id-1", msg());
    expect(received).toEqual([]);
  });

  it("drop removes a connection from all its subscriptions", () => {
    const hub = createInMemoryHub();
    const { received, sink } = collector();
    hub.onPublish(sink);
    hub.subscribe("a", ["id-1", "id-2"]);
    hub.drop("a");
    hub.publish("id-1", msg());
    hub.publish("id-2", msg());
    expect(received).toEqual([]);
  });

  it("does nothing if no sink is registered", () => {
    const hub = createInMemoryHub();
    hub.subscribe("a", ["id-1"]);
    expect(() => hub.publish("id-1", msg())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `pnpm --filter rxfy-server exec vitest run src/hub.test.ts`
Expected: FAIL — cannot resolve `./hub.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/rxfy-server/src/hub.ts`:

```ts
import type { ServerMessage } from "rxfy-protocol";

/** Opaque connection identifier owned by the transport adapter. */
export type ConnId = number | string;

/** Delivers a message to one connection (registered by the transport). */
export type PublishSink = (conn: ConnId, message: ServerMessage) => void;

/**
 * Pure pub/sub over opaque routing ids (the hashed topic keys from the keyer).
 * Holds NO counters — the "updates available" tally is purely client-side.
 */
export type Hub = {
  publish: (id: string, message: ServerMessage) => void;
  subscribe: (conn: ConnId, ids: string[]) => void;
  unsubscribe: (conn: ConnId, ids: string[]) => void;
  drop: (conn: ConnId) => void;
  onPublish: (sink: PublishSink) => void;
};

export function createInMemoryHub(): Hub {
  const subscribers = new Map<string, Set<ConnId>>(); // id -> conns
  const connIds = new Map<ConnId, Set<string>>(); // conn -> ids (for drop)
  let sink: PublishSink | undefined;

  const forget = (conn: ConnId, id: string): void => {
    const conns = subscribers.get(id);
    if (!conns) return;
    conns.delete(conn);
    if (conns.size === 0) subscribers.delete(id);
  };

  return {
    publish(id, message) {
      const conns = subscribers.get(id);
      if (!conns || !sink) return;
      for (const conn of conns) sink(conn, message);
    },
    subscribe(conn, ids) {
      for (const id of ids) {
        let conns = subscribers.get(id);
        if (!conns) subscribers.set(id, (conns = new Set()));
        conns.add(conn);
        let owned = connIds.get(conn);
        if (!owned) connIds.set(conn, (owned = new Set()));
        owned.add(id);
      }
    },
    unsubscribe(conn, ids) {
      for (const id of ids) {
        forget(conn, id);
        connIds.get(conn)?.delete(id);
      }
    },
    drop(conn) {
      const owned = connIds.get(conn);
      if (owned) for (const id of owned) forget(conn, id);
      connIds.delete(conn);
    },
    onPublish(next) {
      sink = next;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `pnpm --filter rxfy-server exec vitest run src/hub.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, type-check, commit**

Run `pnpm --filter rxfy-server lint` (lint:fix then re-lint if needed) and `pnpm --filter rxfy-server check-types`.

```bash
git add packages/rxfy-server/src/hub.ts packages/rxfy-server/src/hub.test.ts
git commit -m "feat(rxfy-server): add in-memory pub/sub hub"
```

---

## Task 3: `test-db.ts` — PGlite test helper

**Files:**
- Create: `packages/rxfy-server/src/test-db.ts`

This is a test-only helper (imported by `server.test.ts`). It is NOT exported from the barrel.

- [ ] **Step 1: Write the helper**

Create `packages/rxfy-server/src/test-db.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";

/** A fresh, isolated in-memory Postgres + drizzle db with `createTableSql` applied. */
export async function createTestDb(createTableSql: string): Promise<{ db: PgliteDatabase; client: PGlite }> {
  const client = new PGlite(); // in-memory, isolated per call
  const db = drizzle(client);
  await client.exec(createTableSql);
  return { db, client };
}
```

- [ ] **Step 2: Confirm it type-checks**

Run: `pnpm --filter rxfy-server check-types`
Expected: exit 0. (If `PgliteDatabase` is not exported from `drizzle-orm/pglite` at this version, type the return `db` as `PgDatabase<any>` imported from `drizzle-orm/pg-core` instead, and report the change.)

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-server/src/test-db.ts
git commit -m "test(rxfy-server): add PGlite test-db helper"
```

---

## Task 4: `server.ts` — write functions + touch + createServer

**Files:**
- Create: `packages/rxfy-server/src/server.ts`
- Test: `packages/rxfy-server/src/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/rxfy-server/src/server.test.ts`:

```ts
import { eq, getTableColumns } from "drizzle-orm";
import { type PgColumn, pgTable, text } from "drizzle-orm/pg-core";
import { type ServerMessage } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { type ConnId, createInMemoryHub } from "./hub.js";
import { defineResource } from "./resource.js";
import { createResourceRegistry } from "./resource-registry.js";
import { createServer, touch } from "./server.js";
import { createTestDb } from "./test-db.js";
import { createTopicKeyer } from "./topic-key.js";

const postsTable = pgTable("posts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
});

const CREATE_POSTS = `
  CREATE TABLE posts (
    id text PRIMARY KEY,
    org_id text NOT NULL,
    title text NOT NULL
  );
`;

const posts = defineResource({ table: postsTable, name: "post" });
const resources = createResourceRegistry([posts]);

// A fixed-window keyer so ids are deterministic within a test.
const keyer = createTopicKeyer({ secret: "test-secret", windowMs: 60_000, now: () => 600_000 });

function harness(db: Awaited<ReturnType<typeof createTestDb>>["db"]) {
  const hub = createInMemoryHub();
  const received: Array<{ conn: ConnId; message: ServerMessage }> = [];
  hub.onPublish((conn, message) => received.push({ conn, message }));
  const live = createServer({ db, resources, hub, keyer });
  return { hub, live, received };
}

describe("createServer.create", () => {
  it("inserts the row and returns it", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);
    const row = await live.create(posts, { id: "1", orgId: "A", title: "Hello" });
    expect(row).toEqual({ id: "1", orgId: "A", title: "Hello" });
    const inDb = await db.select().from(postsTable);
    expect(inDb).toHaveLength(1);
  });

  it("touches the given channels with a bare stale signal", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    // a client subscribed to the page channel's current id
    const channel = "post:orgId=A";
    hub.subscribe("client", [keyer.current(channel)]);
    await live.create(posts, { id: "1", orgId: "A", title: "Hi" }, { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(received).toEqual([{ conn: "client", message: { v: 1, kind: "stale", channel } }]);
  });
});

describe("createServer.update", () => {
  it("updates the row and publishes a patch on the entity topic", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    await live.create(posts, { id: "1", orgId: "A", title: "Old" });
    // a client holding entity post:1 subscribes to its current id
    hub.subscribe("client", [keyer.current("post:1")]);
    const row = await live.update(posts, "1", { title: "New" });
    expect(row).toEqual({ id: "1", orgId: "A", title: "New" });
    expect(received).toEqual([
      { conn: "client", message: { v: 1, kind: "patch", name: "post", id: "1", data: { id: "1", orgId: "A", title: "New" } } },
    ]);
  });
});

describe("createServer.delete", () => {
  it("deletes the row and touches channels", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    await live.create(posts, { id: "1", orgId: "A", title: "X" });
    hub.subscribe("client", [keyer.current("post:orgId=A")]);
    await live.delete(posts, "1", { touch: [touch({ key: "post" }, { orgId: "A" })] });
    expect(await db.select().from(postsTable)).toHaveLength(0);
    expect(received).toEqual([{ conn: "client", message: { v: 1, kind: "stale", channel: "post:orgId=A" } }]);
  });
});

describe("createServer.touch", () => {
  it("publishes a stale signal for an explicit channel", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { hub, live, received } = harness(db);
    hub.subscribe("client", [keyer.current("post:orgId=A")]);
    live.touch(touch({ key: "post" }, { orgId: "A" }));
    expect(received).toEqual([{ conn: "client", message: { v: 1, kind: "stale", channel: "post:orgId=A" } }]);
  });
});

describe("dynamic PK where", () => {
  it("updates by a non-id primary key", async () => {
    const widgetsTable = pgTable("widgets", { sku: text("sku").primaryKey(), label: text("label").notNull() });
    const { db } = await createTestDb(`CREATE TABLE widgets (sku text PRIMARY KEY, label text NOT NULL);`);
    const widgets = defineResource({ table: widgetsTable, name: "widget" });
    const reg = createResourceRegistry([widgets]);
    const hub = createInMemoryHub();
    const live = createServer({ db, resources: reg, hub, keyer });
    await live.create(widgets, { sku: "S1", label: "L" });
    const row = await live.update(widgets, "S1", { label: "L2" });
    expect(row).toEqual({ sku: "S1", label: "L2" });
    // sanity: the PgColumn lookup path is exercised
    const [direct] = await db.select().from(widgetsTable).where(eq(getTableColumns(widgetsTable)["sku"] as PgColumn, "S1"));
    expect(direct.label).toBe("L2");
  });
});
```

- [ ] **Step 2: Run the test to verify it FAILS**

Run: `pnpm --filter rxfy-server exec vitest run src/server.test.ts`
Expected: FAIL — cannot resolve `./server.js`.

- [ ] **Step 3: Write the implementation**

Create `packages/rxfy-server/src/server.ts`:

```ts
import { eq, getTableColumns, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { type PgColumn, type PgDatabase, type PgTable } from "drizzle-orm/pg-core";
import type { IModelRegistry } from "rxfy";
import { patch, stale } from "rxfy-protocol";
import type { Hub } from "./hub.js";
import type { Resource } from "./resource.js";
import type { AnyResource, ResourceRegistry } from "./resource-registry.js";
import { invalidationChannel, type StateChannelDescriptor } from "./state-channel.js";
import type { TopicKeyer } from "./topic-key.js";

/** Any drizzle pg database (pglite in tests, node-postgres in prod). */
type Db = PgDatabase<any, any, any>;

/** A target state channel to mark stale (no data — clients refetch on demand). */
export type TouchTarget = { channel: string };

/** Build a touch target from a state descriptor + params (window dims dropped). */
export function touch(state: StateChannelDescriptor, params: Record<string, unknown>): TouchTarget {
  return { channel: invalidationChannel(state, params) };
}

export type WriteOpts = { touch?: TouchTarget[] };

/** What a grant covers: entity resources (auto from the registry) + named state instances. */
export type GrantSpec = {
  entities?: AnyResource | AnyResource[];
  states?: Array<{ state: StateChannelDescriptor; params: Record<string, unknown> }>;
};

/** A topic→id / channel→id lookup table the client uses to subscribe. */
export type Grants = {
  entities: Record<string, string>;
  channels: Record<string, string>;
};

export type ServerConfig = {
  db: Db;
  resources: ResourceRegistry;
  hub: Hub;
  keyer: TopicKeyer;
};

export type Live = {
  readonly db: Db;
  update: <TTable extends PgTable>(
    resource: Resource<TTable>,
    id: string,
    values: Partial<InferInsertModel<TTable>>,
    opts?: WriteOpts,
  ) => Promise<InferSelectModel<TTable> | undefined>;
  create: <TTable extends PgTable>(
    resource: Resource<TTable>,
    values: InferInsertModel<TTable>,
    opts?: WriteOpts,
  ) => Promise<InferSelectModel<TTable> | undefined>;
  delete: (resource: AnyResource, id: string, opts?: WriteOpts) => Promise<void>;
  touch: (...targets: TouchTarget[]) => void;
  grant: (registry: IModelRegistry, spec: GrantSpec) => Grants;
};

export function createServer({ db, resources, hub, keyer }: ServerConfig): Live {
  const pkColumn = (resource: AnyResource): PgColumn =>
    getTableColumns(resource.table)[resource.primaryKeyColumn] as PgColumn;

  const publishEntity = (name: string, id: string, row: unknown): void => {
    const message = patch(name, id, row);
    for (const hashedId of keyer.forPublish(`${name}:${id}`)) hub.publish(hashedId, message);
  };

  const applyTouch = (targets: TouchTarget[] | undefined): void => {
    for (const target of targets ?? []) {
      const message = stale(target.channel);
      for (const hashedId of keyer.forPublish(target.channel)) hub.publish(hashedId, message);
    }
  };

  return {
    db,
    async update(resource, id, values, opts) {
      const rows = await db
        .update(resource.table)
        .set(values as never)
        .where(eq(pkColumn(resource), id))
        .returning();
      const row = (rows as unknown[])[0];
      if (row !== undefined) publishEntity(resource.name, id, row);
      applyTouch(opts?.touch);
      return row as never;
    },
    async create(resource, values, opts) {
      const rows = await db
        .insert(resource.table)
        .values(values as never)
        .returning();
      applyTouch(opts?.touch);
      return (rows as unknown[])[0] as never;
    },
    async delete(resource, id, opts) {
      await db.delete(resource.table).where(eq(pkColumn(resource), id));
      applyTouch(opts?.touch);
    },
    touch(...targets) {
      applyTouch(targets);
    },
    grant(registry, spec) {
      const entities: Record<string, string> = {};
      const list = spec.entities ? (Array.isArray(spec.entities) ? spec.entities : [spec.entities]) : [];
      for (const resource of list) {
        const store = registry.model(resource.model);
        for (const [key] of store.valueEntries()) {
          const topic = `${resource.name}:${key}`;
          entities[topic] = keyer.current(topic);
        }
      }
      const channels: Record<string, string> = {};
      for (const { state, params } of spec.states ?? []) {
        const channel = invalidationChannel(state, params);
        channels[channel] = keyer.current(channel);
      }
      return { entities, channels };
    },
  };
}
```

> **Type latitude:** the `as never` casts on `db.update(...).set()` / `db.insert(...).values()` and the return values bridge drizzle's per-table generic types through the `Resource<TTable>` indirection — the runtime is correct and pinned by the PGlite tests. Adjust ONLY casts/annotations to make `check-types` pass (do not change runtime logic or weaken tests). If `PgDatabase<any, any, any>` arity is wrong for the installed drizzle, use the arity that compiles (e.g. `PgDatabase<any>`). Report the final `Db` type.

- [ ] **Step 4: Run the test to verify it PASSES**

Run: `pnpm --filter rxfy-server exec vitest run src/server.test.ts`
Expected: PASS — create/update/delete/touch + dynamic-PK cases green, broadcasts match.

- [ ] **Step 5: Lint, type-check, commit**

Run `pnpm --filter rxfy-server lint` (lint:fix then re-lint if needed) and `pnpm --filter rxfy-server check-types`.

```bash
git add packages/rxfy-server/src/server.ts packages/rxfy-server/src/server.test.ts
git commit -m "feat(rxfy-server): add createServer write functions and touch"
```

---

## Task 5: `grant` test (rxfy registry)

**Files:**
- Modify: `packages/rxfy-server/src/server.test.ts` (append a `grant` describe block)

`grant` is already implemented in `server.ts`; this task tests it against a real rxfy model registry.

- [ ] **Step 1: Append the failing test**

Append to `packages/rxfy-server/src/server.test.ts` (merge the new imports into the existing import block — do not duplicate import lines):

```ts
import { createModelRegistry } from "rxfy";

describe("createServer.grant", () => {
  it("mints an id per present entity and per state channel", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);

    const registry = createModelRegistry();
    // seed the rxfy store with two posts (as SSR/fetch would)
    registry.model(posts.model).setMany([
      { id: "1", orgId: "A", title: "a" },
      { id: "2", orgId: "A", title: "b" },
    ]);

    const grants = live.grant(registry, {
      entities: posts,
      states: [{ state: { key: "post", window: ["page"] }, params: { orgId: "A", page: 0 } }],
    });

    expect(grants.entities).toEqual({
      "post:1": keyer.current("post:1"),
      "post:2": keyer.current("post:2"),
    });
    expect(grants.channels).toEqual({
      "post:orgId=A": keyer.current("post:orgId=A"),
    });
  });

  it("returns empty maps when nothing is specified", async () => {
    const { db } = await createTestDb(CREATE_POSTS);
    const { live } = harness(db);
    const registry = createModelRegistry();
    expect(live.grant(registry, {})).toEqual({ entities: {}, channels: {} });
  });
});
```

> If `ModelStore` exposes `setMany` differently (verify against rxfy's `model-store.ts` — it has `setMany(items: T[])` and `valueEntries()`), adapt the seeding call accordingly and report it.

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm --filter rxfy-server exec vitest run src/server.test.ts`
Expected: PASS — including the two new grant cases.

- [ ] **Step 3: Lint, type-check, commit**

```bash
git add packages/rxfy-server/src/server.test.ts
git commit -m "test(rxfy-server): cover grant against the rxfy model registry"
```

---

## Task 6: Barrel export, verification, and changeset

**Files:**
- Modify: `packages/rxfy-server/src/index.ts`
- Create: `.changeset/rxfy-server-writes.md`

- [ ] **Step 1: Update the barrel** (do NOT export `test-db.ts`)

Overwrite `packages/rxfy-server/src/index.ts`:

```ts
export * from "./hub.js";
export * from "./resource-registry.js";
export * from "./resource.js";
export * from "./server.js";
export * from "./state-channel.js";
export * from "./topic-key.js";
```

(Keep the lint-sorted order if `simple-import-sort/exports` reorders.)

- [ ] **Step 2: Full verification**

Run: `pnpm --filter rxfy-server test && pnpm --filter rxfy-server build && pnpm --filter rxfy-server check-types && pnpm --filter rxfy-server lint`
Expected: all tests pass (hub, resource, resource-registry, state-channel, topic-key, server); build emits dist; check-types exit 0; lint clean. Confirm the build does NOT bundle `@electric-sql/pglite` (it is dev-only and `test-db.ts` is not in the barrel, so it must not appear in `dist/index.js`).

- [ ] **Step 3: Create the changeset** `.changeset/rxfy-server-writes.md`:

```md
---
"rxfy-server": minor
---

Add the server core: `createInMemoryHub` (pub/sub), `createServer` write functions (`update`/`create`/`delete`/`touch`) that persist via Drizzle and broadcast over the hub, and `grant` (mint hashed topic ids for a response's entities and state channels).
```

- [ ] **Step 4: Verify changeset + commit**

Run: `pnpm changeset status` (lists rxfy-server at minor).

```bash
git add packages/rxfy-server/src/index.ts .changeset/rxfy-server-writes.md
git commit -m "feat(rxfy-server): export hub and server; add changeset"
```

---

## Final Verification

- [ ] Run: `pnpm turbo build test lint check-types --filter=rxfy-server`
Expected: all four tasks succeed.

---

## Self-Review Notes

- **Spec coverage:** §5.4 hub (pure pub/sub, no counters, opaque-id routing), §5.3 write functions (`update` → row `.returning()` + `patch` on entity topic's windowed ids; `create`/`delete` → write + `touch`; writes publish to current+previous window via `keyer.forPublish`), `touch`/`TouchTarget` (bare `stale` signal, channel derived via `invalidationChannel`), and §5.5 `grant` (entity ids auto from the rxfy registry's `valueEntries()`, channel ids from states). End-to-end create/update/delete flows from §6 are exercised against PGlite.
- **Verified API (probes):** PGlite 0.5.3 (`new PGlite()` in-memory/isolated, no `waitReady`, `drizzle(client)`, `client.exec` DDL with snake_case columns, `.returning()`, timestamp→Date); dynamic PK via `getTableColumns(table)[pk] as PgColumn`; drizzle 0.45.2.
- **Type soft-spots:** `Db = PgDatabase<any,…>` and `as never` casts bridge drizzle's per-table generics through `Resource<TTable>`; documented latitude lets the implementer adjust ONLY types, with PGlite tests pinning runtime behavior.
- **Out of scope (later plans):** `rxfy-ws` transport (Plan 5); client live-client + `rxfy-react` `useStateData` counter + rxfy-core `window` field (Plan 6). The `stale` message carries the plaintext `channel` so the client can match it to its local counter; the hub routes by the hashed id.
- **Type consistency:** `createServer(config): Live`; `Live` methods consume `Resource<TTable>`/`AnyResource` from Plan 3 and the `Hub`/`TopicKeyer` from earlier; `grant(registry: IModelRegistry, spec): Grants`. Plan 5 (ws) wires `hub.onPublish` + `subscribe`/`unsubscribe`/`drop`; Plan 6 consumes `Grants` (topic→id / channel→id).
