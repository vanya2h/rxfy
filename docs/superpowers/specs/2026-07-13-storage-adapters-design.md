# Storage Adapters: decouple the live server from Drizzle

**Date:** 2026-07-13
**Status:** Approved (implement as its own PR, after the entity-grants branch lands)

## Summary

The live server's write path is hardcoded to Drizzle Postgres: `createServer` requires `db: PgDatabase`, its `create`/`update`/`delete` build raw Drizzle queries, and `defineResource` wraps a `PgTable` (deriving the model/zod via `drizzle-zod`). An app on any other store (the in-memory examples, a future KV/HTTP backend) cannot use `createServer` at all — which is exactly why `rr7-blog` and `next-blog` hand-roll their writes against the bare hub.

This design introduces a **storage-adapter port** so the core is storage-agnostic. Persistence moves behind a small `LiveStorage` interface; the neutral `Resource` carries an **opaque binding** that only its adapter understands. Drizzle and in-memory ship as **separate packages**; core drops its `drizzle-orm` dependency.

- **`rxfy-server`** — storage-agnostic core: the hub, the grant issuer (`serve`/`renew`/`hydration`), the publish logic, the `LiveStorage` port, the neutral `Resource` type, and `createLive({ storage, hub, secret })`. No `drizzle-orm`.
- **`rxfy-server-drizzle`** — the Drizzle/Postgres adapter: `defineResource({ table })` and `drizzleStorage(db)`. Peer-deps `drizzle-orm`, `drizzle-zod`.
- **`rxfy-server-memory`** — the in-memory adapter: `defineCollection({ name, model })` and `memoryStorage()`. Zero deps.

Naming stays **unscoped**, matching the existing `rxfy-*` convention (`rxfy-react`, `rxfy-client`, `rxfy-ws`). Core keeps the name `rxfy-server`.

The grant half and the publish half are already storage-agnostic (see [2026-07-13-entity-grants-design.md](2026-07-13-entity-grants-design.md) and the `createGrantIssuer` extraction). This design decouples only what remains: the writers and the `Resource`/`defineResource` abstraction.

---

## Background: what is coupled today

- `ServerConfig.db: PgDatabase` and `ServerConfig.resources: ResourceRegistry` — Drizzle types in the core config.
- `createServer`'s writers run `db.insert/update/delete(resource.table).…returning()` and read Drizzle column config via `pkColumn`.
- `resource.ts` — `Resource` wraps a `PgTable`; `defineResource` derives the model/zod through `drizzle-zod`; `primaryKeyColumn` reads Drizzle table config.

Already storage-agnostic and staying in core untouched: the hub (`hub.ts`), subscription-id helpers, `createGrantIssuer` (`grant-issuer.ts`), `grantsHydration`, `state-channel.ts`, and the publish helpers (`publishEntity` → `patch`, `applyTouch` → `stale`).

---

## Design

### 1. The `LiveStorage` port (core)

A three-method persistence interface, **generic over the binding type** so a storage accepts only its own adapter's resources. Each method receives the resource's `binding` and returns rows; core never inspects the binding, and the row/values payloads stay `unknown` at this seam (their precise types live on the `Resource` generics — see §7).

```ts
// rxfy-server
export type LiveStorage<TBinding = unknown> = {
  /** Insert values, return the persisted row. Throws on failure (a store bug). */
  create(binding: TBinding, values: unknown): Promise<unknown>;
  /** Update the row by id, return it — or undefined when no row matches (not found). */
  update(binding: TBinding, id: string, values: unknown): Promise<unknown | undefined>;
  /** Delete the row by id. */
  delete(binding: TBinding, id: string): Promise<void>;
};
```

`TBinding` is **uniform per adapter** — a single shape shared by all of that adapter's resources (`{ table, pkColumn }` for Drizzle, `{ rows, getKey }` for memory). The per-row precision lives on the `Resource`'s `TInsert`/`TRow` params, not the binding, so one `LiveStorage<DrizzleBinding>` serves every Drizzle table.

### 2. The neutral `Resource` (core)

`Resource` loses all Drizzle types. It carries the client-facing model, the key extractor, and the adapter's binding:

```ts
// rxfy-server
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
```

The `resource.name !== model.name` dev-warning moves to each adapter's `defineResource`/`defineCollection` (it's a property of the resource, checkable at definition time), so core carries no warning loop and needs no `resources` list.

### 3. `createLive` (core)

Replaces `createServer`. Takes a `storage` instead of `db` + `resources`; drops `db` from the returned `Live`. Writers persist via the port, then publish/touch (unchanged), then expose the grant issuer:

`createLive` is generic over `TBinding`: the storage fixes it, and every write requires a `Resource` whose binding matches — so `drizzleStorage(db)` accepts only Drizzle resources and `memoryStorage()` only memory collections, checked at compile time.

```ts
// rxfy-server
export type LiveConfig<TBinding> = {
  storage: LiveStorage<TBinding>;
  hub: Hub;
  secret: string;
  grantTtlMs?: number;
  renewGraceMs?: number;
};

export type Live<TBinding> = GrantIssuer & {
  create: <TInsert, TRow>(resource: Resource<TInsert, TRow, TBinding>, values: TInsert, opts?: WriteOpts) => Promise<TRow>;
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
  // publishEntity / applyTouch unchanged (hub.publish of patch / stale)
  return {
    async create(resource, values, opts) {
      const row = await storage.create(resource.binding, values);
      publishEntity(resource.name, resource.getKey(row as never), row);
      applyTouch(opts?.touch);
      return row as never;
    },
    async update(resource, id, values, opts) {
      const row = await storage.update(resource.binding, id, values);
      if (row === undefined) return undefined;
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

Type safety is preserved: `values` is inferred from the resource's `TInsert`, which each adapter types from its own source of truth.

### 4. `rxfy-server-drizzle`

Holds today's Drizzle code. `defineResource` builds a `Resource` whose binding is `{ table, pkColumn }`; `drizzleStorage(db)` implements `LiveStorage` against that binding:

`DrizzleBinding` is the uniform per-adapter shape (the specific table type is erased to `PgTable` in the binding; the precise row/insert types ride the `Resource` generics):

```ts
// rxfy-server-drizzle
export type DrizzleBinding = { table: PgTable; pkColumn: string };

export function defineResource<TTable extends PgTable, ...>(config: {
  table: TTable; name?: string; model?: ModelDescriptor<TRow>;
}): Resource<InferInsertModel<TTable>, InferSelectModel<TTable>, DrizzleBinding>;

export function drizzleStorage(db: PgDatabase<any, any, any>): LiveStorage<DrizzleBinding> {
  return {
    async create(binding, values) {
      const [row] = await db.insert(binding.table).values(values).returning();
      if (row === undefined) throw new Error("rxfy-server-drizzle: insert returned no row");
      return row;
    },
    async update(binding, id, values) {
      const [row] = await db.update(binding.table).set(values).where(eq(col(binding), id)).returning();
      return row; // undefined when no row matched
    },
    async delete(binding, id) {
      await db.delete(binding.table).where(eq(col(binding), id));
    },
  };
}
```

`primaryKeyColumn` and the `drizzle-zod` model derivation move here.

### 5. `rxfy-server-memory`

`defineCollection` builds a `Resource` whose binding **is** the data store (a `Map`) plus the key extractor; `memoryStorage()` reads/writes those Maps. Because the collection's Map is both the write target and the read source, an app can read from it directly — one source of truth:

`MemoryBinding` is uniform (row type erased to `unknown`, like `DrizzleBinding` erases the table) so one `memoryStorage()` serves every collection; the precise `TRow` rides the `Resource` generics and the `all`/`get` convenience methods. `defineCollection` creates the backing `Map<string, TRow>` internally and exposes it as the erased binding:

```ts
// rxfy-server-memory
export type MemoryBinding = { rows: Map<string, unknown>; getKey: (row: unknown) => string };

// Insert shape is the full row (the caller supplies the id, so `create` can key it); `update`
// still takes Partial<TRow> via Live.update's Partial<TInsert>.
export function defineCollection<TRow>(config: {
  name: string; model: ModelDescriptor<TRow>; seed?: TRow[];
}): Resource<TRow, TRow, MemoryBinding> & { all: () => TRow[]; get: (id: string) => TRow | undefined };

export function memoryStorage(): LiveStorage<MemoryBinding> {
  return {
    async create(binding, values) {
      const row = values as never;
      binding.rows.set(binding.getKey(row), row);
      return row;
    },
    async update(binding, id, values) {
      const existing = binding.rows.get(id);
      if (existing === undefined) return undefined;
      const row = { ...existing, ...(values as object) } as never;
      binding.rows.set(id, row);
      return row;
    },
    async delete(binding, id) {
      binding.rows.delete(id);
    },
  };
}
```

The `rr7-blog` / `next-blog` in-memory stores collapse onto these collections: writes go through `live.create/update/delete`; reads (`listPosts`, `getPostDetail`) read the collection Maps.

### 6. Ripple effects

- **`rxfy-server/hub` subpath collapses.** Its only purpose was a Drizzle-free import; once core *is* Drizzle-free, the main entry already is, so the subpath is redundant. Merge it into the main entry and drop the `./hub` export.
- **`createServer` → `createLive`; `ServerConfig` → `LiveConfig`** (`{ db, resources }` → `{ storage }`); `Live` drops `db`. Breaking rename — acceptable under the 3.0.0 major already in flight.
- **`ResourceRegistry` / `createResourceRegistry`** are no longer required by the core writers (each call passes its resource). Keep them in core as a neutral name→resource lookup helper for apps that want it, retyped over the neutral `Resource`; not part of `LiveConfig`.
- **Migration**: the Drizzle examples/templates (`vite-blog-framework`, `waku-blog`, `vite-ssr-pagination`, `templates/vite`) import `defineResource`/`drizzleStorage` from `rxfy-server-drizzle` and pass `storage: drizzleStorage(db)`; the in-memory examples (`rr7-blog`, `next-blog`) adopt `rxfy-server-memory`. Docs (`apps/docs`) and skills (`.agents/skills/rxfy-framework`) updated. Changesets: `major` for `rxfy-server`, plus initial releases for the two adapter packages.

### 7. Type inference (integration level)

Types flow in two layers, and the `unknown` on the port never reaches the app:

- **Source** — the adapter's `defineResource` / `defineCollection` produces a fully typed `Resource<TInsert, TRow, TBinding>` (from the Drizzle table, or the declared row for memory).
- **Consumer** — `live.create/update/delete` are generic over the resource, so `values` is inferred as `TInsert` (or `Partial<TInsert>`) and the result as `TRow`. The integrator writes `live.create(posts, values)` and gets full inference and a checked `values` shape.
- **Seam** — inside `createLive`, `storage.create(resource.binding, values)` crosses the `unknown` payload boundary with two contained casts (`values → unknown`, `unknown result → TRow`). This is invisible to the app.

```ts
const posts = defineResource({ table: postsTable });   // Resource<PostInsert, PostRow, DrizzleBinding>
const live = createLive({ storage: drizzleStorage(db), hub, secret }); // Live<DrizzleBinding>
await live.create(posts, values);   // values: PostInsert ✓   returns Promise<PostRow>
await live.create(memoryCollection, values); // ✗ compile error: binding mismatch
```

Because `createLive` is generic over `TBinding` and the writers require `Resource<…, TBinding>`, pairing a storage with a foreign adapter's resource is a **compile-time** error, not a runtime one. Row/values payloads remain `unknown` only *at the port* — they can't be known by a generic storage — while the app-facing generics carry them precisely.

---

## Testing

- **Core** — a `fakeStorage` (in-test `LiveStorage`) drives `createLive`: `create`/`update`/`delete` call the port with the resource's binding, publish the right patch/stale, and `update` returning `undefined` publishes nothing. Grant methods delegate to the issuer (already covered).
- **`rxfy-server-drizzle`** — against pglite: `drizzleStorage` create/update/delete round-trip; `update` on a missing id resolves `undefined`; `defineResource` derives the model/zod and binding.
- **`rxfy-server-memory`** — `memoryStorage` create/update/delete mutate the collection Map; `update` on a missing id resolves `undefined`; `defineCollection` seeds and exposes `all`/`get`.
- **End-to-end** — each adapter drives the existing smoke test (`serve → grant → subscribe → live.update → patch reaches the client store`) so both backends exercise the same core path.

---

## Scope & sequencing

This is a large, breaking refactor: two new published packages, a core restructure, and a migration across every example/template and the docs. It is independent of the entity-grants work. **Implement it as its own PR after `feat/grantless` lands** — do not fold it into that branch.
