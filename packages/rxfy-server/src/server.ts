import { eq, getTableColumns, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { type PgColumn, type PgDatabase, type PgTable } from "drizzle-orm/pg-core";
import {
  createModelRegistry,
  type IModelRegistry,
  normalizeResult,
  parseShape,
  stateChannel,
  type StateDescriptor,
} from "rxfy";
import { patch, RXFY_SESSION_HEADER, stale } from "rxfy-protocol";
import { channelSubscription, entitySubscription, type Hub, type SessionId } from "./hub.js";
import { hubHydration } from "./hydration.js";
import type { Resource } from "./resource.js";
import type { AnyResource, ResourceRegistry } from "./resource-registry.js";
import type { TouchTarget } from "./state-channel.js";

/** Any drizzle pg database (pglite in tests, node-postgres in prod). */
type Db = PgDatabase<any, any, any>;

export type WriteOpts = { touch?: TouchTarget[] };

/** The session id itself, or a request-like carrying it in the RXFY_SESSION_HEADER header. */
export type SessionSource = SessionId | { headers: { get: (name: string) => string | null } };

export type ServerConfig = {
  db: Db;
  resources: ResourceRegistry;
  hub: Hub;
};

export type Live = {
  readonly db: Db;
  // TRow is inferred, not constrained: values and the returned row are typed from the table,
  // so resources carrying an injected model (branded / narrower row) fit as-is.
  /**
   * Updates the row by id and publishes a patch. Resolves `undefined` when no row matches
   * (not found) — nothing is written, so no patch or touch is published either.
   */
  update: <TTable extends PgTable, TRow>(
    resource: Resource<TTable, TRow>,
    id: string,
    values: Partial<InferInsertModel<TTable>>,
    opts?: WriteOpts,
  ) => Promise<InferSelectModel<TTable> | undefined>;
  create: <TTable extends PgTable, TRow>(
    resource: Resource<TTable, TRow>,
    values: InferInsertModel<TTable>,
    opts?: WriteOpts,
  ) => Promise<InferSelectModel<TTable>>;
  delete: (resource: AnyResource, id: string, opts?: WriteOpts) => Promise<void>;
  touch: (...targets: TouchTarget[]) => void;
  /**
   * Parses `data` (the state's *input* shape — e.g. raw DB rows with unbranded ids and extra
   * columns) into the state's shape via the field schemas, registers what it contains as the
   * session's live subscriptions, and returns the parsed shape (unknown keys stripped).
   */
  serve: <TParams, TShape, TShapeInput>(
    req: SessionSource,
    state: StateDescriptor<TParams, TShape, any, any, any, TShapeInput>,
    params: TParams,
    data: TShapeInput,
  ) => TShape;
  /** One-call SSR payload: mints a session, registers the render registry's contents, returns the hydration script. */
  hydration: (registry: IModelRegistry) => string;
};

export function createServer({ db, resources, hub }: ServerConfig): Live {
  const pkColumn = (resource: AnyResource): PgColumn =>
    getTableColumns(resource.table)[resource.primaryKeyColumn] as PgColumn;

  const publishEntity = (name: string, id: string, row: unknown): void => {
    hub.publish(entitySubscription(name, id), patch(name, id, row));
  };

  const applyTouch = (targets: TouchTarget[] | undefined): void => {
    for (const target of targets ?? []) {
      hub.publish(channelSubscription(target.channel), stale(target.channel));
    }
  };

  /** Subscription ids for a populated registry's resource-backed entities. */
  const entityIds = (registry: IModelRegistry): string[] => {
    const byModelKey = new Map(resources.all().map((r) => [r.model._key, r]));
    const ids: string[] = [];
    for (const { descriptor, store } of registry.stores()) {
      const resource = byModelKey.get(descriptor._key);
      if (!resource) continue; // no live resource — a client-only model, nothing will be pushed
      for (const [key] of store.valueEntries()) ids.push(entitySubscription(resource.name, key));
    }
    return ids;
  };

  /** Subscription ids for everything a populated registry holds: resource-backed entities + logged channels. */
  const subscriptionIds = (registry: IModelRegistry): string[] => [
    ...entityIds(registry),
    ...[...registry.channels.all()].map(channelSubscription),
  ];

  const sessionOf = (req: SessionSource): SessionId | undefined =>
    typeof req === "string" ? req : (req.headers.get(RXFY_SESSION_HEADER) ?? undefined);

  return {
    db,
    async update(resource, id, values, opts) {
      const rows = await db
        .update(resource.table)
        .set(values as never)
        .where(eq(pkColumn(resource), id))
        .returning();
      const row = (rows as unknown[])[0];
      if (row === undefined) return undefined; // not found — nothing written, publish nothing
      publishEntity(resource.name, id, row);
      applyTouch(opts?.touch);
      return row as never;
    },
    async create(resource, values, opts) {
      const rows = await db
        .insert(resource.table)
        .values(values as never)
        .returning();
      const row = (rows as unknown[])[0];
      // A plain insert with `.returning()` yields exactly one row or throws; zero is a driver bug.
      if (row === undefined) throw new Error("rxfy-server: insert returned no row");
      applyTouch(opts?.touch);
      return row as never;
    },
    async delete(resource, id, opts) {
      await db.delete(resource.table).where(eq(pkColumn(resource), id));
      applyTouch(opts?.touch);
    },
    touch(...targets) {
      applyTouch(targets);
    },
    serve(req, state, params, data) {
      // Parse before the session check so every consumer gets the same (validated, brand-applied,
      // unknown-keys-stripped) payload, live session or not.
      const parsed = parseShape<Record<string, unknown>>(state.fields, data);
      const session = sessionOf(req);
      if (!session) return parsed as never; // no session header — a non-live consumer (curl, server-to-server)
      const registry = createModelRegistry();
      normalizeResult(registry, state.fields, parsed);
      const channel = stateChannel(state, params as Record<string, unknown>);
      if (channel) registry.channels.add(channel);
      hub.subscribe(session, subscriptionIds(registry));
      return parsed as never;
    },
    hydration(registry) {
      return hubHydration(hub, registry, entityIds(registry));
    },
  };
}
