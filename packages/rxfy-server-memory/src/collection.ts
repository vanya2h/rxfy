import type { ModelDescriptor } from "rxfy";
import type { Resource } from "rxfy-server";

/** The uniform in-memory binding — the backing map + key extractor (row type erased). */
export type MemoryBinding = { rows: Map<string, unknown>; getKey: (row: unknown) => string };

/** An in-memory collection: a `Resource` whose binding IS its data map, plus `all`/`get` reads. */
export type Collection<TRow> = Resource<TRow, TRow, MemoryBinding> & {
  all: () => TRow[];
  get: (id: string) => TRow | undefined;
};

export function defineCollection<TRow>(config: {
  name: string;
  model: ModelDescriptor<TRow>;
  seed?: TRow[];
}): Collection<TRow> {
  const rows = new Map<string, TRow>();
  const getKey = config.model.getKey;
  for (const row of config.seed ?? []) rows.set(getKey(row), row);
  const binding: MemoryBinding = {
    rows: rows as Map<string, unknown>,
    getKey: getKey as (row: unknown) => string,
  };
  return {
    name: config.name,
    model: config.model,
    getKey,
    binding,
    all: () => [...rows.values()],
    get: (id) => rows.get(id),
  };
}
