import type { IModelRegistry } from "../model/model-store.js";
import { type SerializedWrapped, deserializeWrapped, serializeForHtml, serializeWrapped } from "./serialize.js";

export type DehydratedState = {
  queries: Record<string, SerializedWrapped>;
  models: Record<string, Record<string, unknown>>;
};

// Streaming SSR calls dehydrate once per flush — warn once per descriptor, not per call.
const warnedUnnamed = new WeakSet<object>();

/** Serializes the registry's query cache (ids) and named model stores (entities) to a JSON-safe snapshot. */
export function dehydrate(registry: IModelRegistry): DehydratedState {
  const queries: DehydratedState["queries"] = {};
  for (const [key, wrapped] of registry.queries.entries()) {
    const serialized = serializeWrapped(wrapped);
    if (serialized) queries[key] = serialized;
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
    registry.queries.getQuery(key).set(deserializeWrapped(entry));
  }
}

/**
 * Complete inline <script> tag pushing a snapshot onto window.__RXFY_SSR__ — the queue
 * StoreProvider drains automatically on the client, so no client-side wiring is needed.
 * Inject it into the served HTML before the client entry script.
 */
export function hydrationScript(state: DehydratedState): string {
  return `<script>(window.__RXFY_SSR__=window.__RXFY_SSR__||[]).push(${serializeForHtml(state)})</script>`;
}
