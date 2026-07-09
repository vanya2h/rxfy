import { randomUUID } from "node:crypto";
import { eq, getTableColumns, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { type PgColumn, type PgDatabase, type PgTable } from "drizzle-orm/pg-core";
import {
  createModelRegistry,
  dehydrate,
  hydrationScript,
  type IModelRegistry,
  normalizeResult,
  stateChannel,
  type StateDescriptor,
} from "rxfy";
import { patch, RXFY_SESSION_HEADER, stale } from "rxfy-protocol";
import type { Hub, SessionId } from "./hub.js";
import type { Resource } from "./resource.js";
import type { AnyResource, ResourceRegistry } from "./resource-registry.js";
import { invalidationChannel, type StateChannelDescriptor } from "./state-channel.js";

/** Any drizzle pg database (pglite in tests, node-postgres in prod). */
type Db = PgDatabase<any, any, any>;

/** A target state channel to mark stale (no data — clients refetch on demand). */
export type TouchTarget = { channel: string };

/** Build a touch target from a state descriptor + params (window dims dropped). */
export function touch(state: StateChannelDescriptor, params: Record<string, unknown>): TouchTarget {
  return { channel: invalidationChannel(state, params) };
}

export type WriteOpts = { touch?: TouchTarget[] };

/** Hub subscription id for an entity topic. The `e:`/`c:` prefixes keep entity and channel namespaces disjoint. */
export const entitySubscription = (name: string, id: string): string => `e:${name}:${id}`;
/** Hub subscription id for a state invalidation channel. */
export const channelSubscription = (channel: string): string => `c:${channel}`;

/** The session id itself, or a request-like carrying it in the RXFY_SESSION_HEADER header. */
export type SessionSource = SessionId | { headers: { get: (name: string) => string | null } };

export type ServerConfig = {
  db: Db;
  resources: ResourceRegistry;
  hub: Hub;
};

export type Live = {
  readonly db: Db;
  update: <TTable extends PgTable>(
    resource: Resource<TTable>,
    id: string,
    values: Partial<InferInsertModel<TTable>>,
    opts?: WriteOpts,
    // @todo this must not return undefined
  ) => Promise<InferSelectModel<TTable> | undefined>;
  create: <TTable extends PgTable>(
    resource: Resource<TTable>,
    values: InferInsertModel<TTable>,
    opts?: WriteOpts,
    // @todo this must not return undefined
  ) => Promise<InferSelectModel<TTable> | undefined>;
  delete: (resource: AnyResource, id: string, opts?: WriteOpts) => Promise<void>;
  touch: (...targets: TouchTarget[]) => void;
  /** Pass-through: registers what `data` contains as the session's live subscriptions, returns `data` unchanged. */
  serve: <TParams, TShape>(
    req: SessionSource,
    state: StateDescriptor<TParams, TShape, any, any, any>,
    params: TParams,
    data: TShape,
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

  /** Subscription ids for everything a populated registry holds: resource-backed entities + logged channels. */
  const subscriptionIds = (registry: IModelRegistry): string[] => {
    const byModelKey = new Map(resources.all().map((r) => [r.model._key, r]));
    const ids: string[] = [];
    for (const { descriptor, store } of registry.stores()) {
      const resource = byModelKey.get(descriptor._key);
      if (!resource) continue; // no live resource — a client-only model, nothing will be pushed
      for (const [key] of store.valueEntries()) ids.push(entitySubscription(resource.name, key));
    }
    for (const channel of registry.channels.all()) ids.push(channelSubscription(channel));
    return ids;
  };

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
    serve(req, state, params, data) {
      const session = sessionOf(req);
      if (!session) return data; // no session header — a non-live consumer (curl, server-to-server)
      const registry = createModelRegistry();
      normalizeResult(registry, state.fields, data);
      const channel = stateChannel(state, params as Record<string, unknown>);
      if (channel) registry.channels.add(channel);
      hub.subscribe(session, subscriptionIds(registry));
      return data;
    },
    hydration(registry) {
      const session = randomUUID();
      hub.subscribe(session, subscriptionIds(registry));
      return hydrationScript({ ...dehydrate(registry), session });
    },
  };
}
