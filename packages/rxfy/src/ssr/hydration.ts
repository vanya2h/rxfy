import type { IModelRegistry } from "../model/model-store.js";
import type { QueryEntry } from "../query/query-cache.js";

export type DehydratedState = {
  queries: Record<string, QueryEntry>;
  models: Record<string, Record<string, unknown>>;
};

// Streaming SSR calls dehydrate once per flush — warn once per descriptor, not per call.
const warnedUnnamed = new WeakSet<object>();

/** Serializes the registry's query cache (ids) and named model stores (entities) to a JSON-safe snapshot. */
export function dehydrate(registry: IModelRegistry): DehydratedState {
  const queries: DehydratedState["queries"] = {};
  for (const [key, entry] of registry.queries.entries()) {
    queries[key] = entry;
  }

  const models: DehydratedState["models"] = {};
  for (const { descriptor, store } of registry.stores()) {
    if (descriptor.name) {
      models[descriptor.name] = Object.fromEntries(store.valueEntries());
    } else if (store.valueEntries().length > 0 && !warnedUnnamed.has(descriptor)) {
      warnedUnnamed.add(descriptor);
      console.warn("rxfy: model store holds data but has no name — it will not be dehydrated for SSR");
    }
  }

  return { queries, models };
}

/** Ingests a dehydrated snapshot: model entities → stores (via stash), query entries → cache. */
export function hydrate(registry: IModelRegistry, state: DehydratedState): void {
  for (const [name, entities] of Object.entries(state.models)) {
    registry.stashHydration(name, entities);
  }
  for (const [key, entry] of Object.entries(state.queries)) {
    registry.queries.set(key, entry);
  }
}
