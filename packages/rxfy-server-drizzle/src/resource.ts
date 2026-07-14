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
        `sync entity patches publish under the resource name and will not route to the model store`,
    );
  }
}
