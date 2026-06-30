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
    const column = (table as unknown as Record<string, unknown>)[jsKey] as { primary?: boolean } | undefined;
    if (column && typeof column === "object" && column.primary === true) {
      pkColumns.push(jsKey);
    }
  }
  if (pkColumns.length === 1) {
    return pkColumns[0]!;
  }
  if (pkColumns.length > 1) {
    throw new Error(
      `rxfy-server: table "${getTableConfig(table).name}" has multiple primary key columns; composite keys are not supported`,
    );
  }
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
  // We use `any` for the TInput param to avoid TS2719 (dual-module ZodType identity clash).
  const zod = createSelectSchema(config.table) as unknown as z.ZodType<TRow, any>;
  const getKey = (row: TRow): string => String((row as Record<string, unknown>)[pk]);
  const model = createModel<TRow, string, any>({ schema: zod, getKey, name });

  return { table: config.table, name, model, zod, getKey, primaryKeyColumn: pk };
}
