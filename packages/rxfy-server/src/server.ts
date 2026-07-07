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
  grant: (registry: IModelRegistry, spec: GrantSpec) => Grants;
};

export function createServer({ db, resources, hub, keyer }: ServerConfig): Live {
  // `resources` is part of the public config for symmetry/future use; not needed by the writers
  // (each call passes its resource explicitly). Reference it to satisfy noUnusedParameters if set.
  void resources;

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
