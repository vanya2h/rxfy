import { eq, getTableColumns } from "drizzle-orm";
import { type PgColumn, type PgDatabase } from "drizzle-orm/pg-core";
import type { SyncStorage } from "rxfy-server";
import type { DrizzleBinding } from "./resource.js";

const pkCol = (binding: DrizzleBinding): PgColumn => getTableColumns(binding.table)[binding.pkColumn] as PgColumn;

/** A `SyncStorage` backed by a Drizzle Postgres database. Pair with `defineResource` resources. */
export function drizzleStorage(db: PgDatabase<any, any, any>): SyncStorage<DrizzleBinding> {
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
