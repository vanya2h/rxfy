import { eq, getTableColumns, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { type PgColumn, type PgDatabase, type PgTable } from "drizzle-orm/pg-core";
import { patch, stale } from "rxfy-protocol";
import { createGrantIssuer, type GrantIssuer } from "./grant-issuer.js";
import { channelSubscription, entitySubscription, type Hub } from "./hub.js";
import type { Resource } from "./resource.js";
import type { AnyResource, ResourceRegistry } from "./resource-registry.js";
import type { TouchTarget } from "./state-channel.js";

/** Any drizzle pg database (pglite in tests, node-postgres in prod). */
type Db = PgDatabase<any, any, any>;

export type WriteOpts = { touch?: TouchTarget[] };

export type ServerConfig = {
  db: Db;
  resources: ResourceRegistry;
  hub: Hub;
  /** HMAC secret for signing/verifying channel grants (required). */
  secret: string;
  /** Grant lifetime in ms. Default 15 minutes. */
  grantTtlMs?: number;
  /** Renewal grace window in ms — a grant expired by up to this long still renews. Default 5 minutes. */
  renewGraceMs?: number;
};

/**
 * The full live server: the Drizzle-bound writers plus the stateless grant half (`serve` / `renew`
 * / `hydration`), which is shared with the bare hub via {@link GrantIssuer}.
 */
export type Live = GrantIssuer & {
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
};

export function createServer(config: ServerConfig): Live {
  const { db, resources, hub } = config;
  const issuer = createGrantIssuer(config);

  const pkColumn = (resource: AnyResource): PgColumn =>
    getTableColumns(resource.table)[resource.primaryKeyColumn] as PgColumn;

  // Live entity patches publish under `resource.name`; the client routes them into the model store
  // by model name. When they differ, patches never reach the client — warn in dev.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NODE_ENV !== "production") {
    for (const resource of resources.all()) {
      if (resource.name !== resource.model.name) {
        console.warn(
          `rxfy-server: resource "${resource.name}" has a different model name "${resource.model.name}"; ` +
            `live entity patches publish under the resource name and will not route to the model store`,
        );
      }
    }
  }

  const publishEntity = (name: string, id: string, row: unknown): void => {
    hub.publish(entitySubscription(name, id), patch(name, id, row));
  };

  const applyTouch = (targets: TouchTarget[] | undefined): void => {
    for (const target of targets ?? []) {
      hub.publish(channelSubscription(target.channel), stale(target.channel));
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
    // The stateless grant half — serve / renew / hydration — has no dependency on the writers.
    serve: issuer.serve,
    renew: issuer.renew,
    hydration: issuer.hydration,
  };
}
