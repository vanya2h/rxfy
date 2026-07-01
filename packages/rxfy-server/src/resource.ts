import type { InferSelectModel } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { createModel, type ModelDescriptor } from "rxfy";
import type { z } from "zod";

/** A Drizzle table bound to an rxfy model + Zod schema + key extractor. */
export type Resource<
  TTable extends PgTable = PgTable,
  TRow = InferSelectModel<TTable>,
  TName extends string = string,
> = {
  /** The underlying Drizzle table. */
  readonly table: TTable;
  /** Topic namespace / rxfy model name (defaults to the SQL table name). */
  readonly name: TName;
  /** The derived rxfy model — a drop-in `ModelDescriptor` for `useModelStore`/`useStateData`. */
  readonly model: ModelDescriptor<TRow>;
  /** The row schema derived from the table via drizzle-zod. */
  readonly zod: z.ZodType<TRow, any>;
  /** Extracts the entity key (the single primary-key column) as a string. */
  readonly getKey: (row: TRow) => string;
  /** JS property name of the single primary-key column. */
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
    // @todo why can't we have composite ids?
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

/** Derive a resource from a Drizzle table, or bind the table to a pre-made rxfy `model`. No codegen. */
export function defineResource<
  TTable extends PgTable,
  const TName extends string = string,
  // TRow follows the injected model's row type; otherwise the table's select model. The table's
  // own row may have extra columns (e.g. `createdAt`) the shared model omits — that's fine.
  TRow = InferSelectModel<TTable>,
>(config: {
  table: TTable;
  // @todo we can derive name from PgTable type using infer from TableConfig
  name?: TName;
  /** A pre-made rxfy model to bind (e.g. a shared model). When omitted, one is derived via drizzle-zod. */
  model?: ModelDescriptor<TRow>;
}): Resource<TTable, TRow, TName> {
  const pk = primaryKeyColumn(config.table);
  const name = (config.name ?? config.model?.name ?? getTableConfig(config.table).name) as TName;

  if (config.model) {
    // Bind the table (for SQL) to the supplied model (for the client store / live routing).
    // `name` defaults to the model's name so live patch/stale topics route into the model's store.
    return {
      table: config.table,
      name,
      model: config.model,
      zod: config.model.schema,
      getKey: config.model.getKey as (row: TRow) => string,
      primaryKeyColumn: pk,
    };
  }

  // drizzle-zod's output type and InferSelectModel agree at runtime (verified); bridge the nominal gap.
  // We use `any` for the TInput param to avoid TS2719 (dual-module ZodType identity clash).
  const zod = createSelectSchema(config.table) as unknown as z.ZodType<TRow, any>;
  const getKey = (row: TRow): string => String((row as Record<string, unknown>)[pk]);
  const model = createModel<TRow, string>({ schema: zod, getKey, name });

  return {
    table: config.table,
    name,
    model,
    zod,
    getKey,
    primaryKeyColumn: pk,
  };
}
