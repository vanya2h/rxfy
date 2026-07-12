import type { IModelRegistry } from "../model/model-store.js";
import { deserializeWrapped, type SerializedWrapped, serializeForHtml, serializeWrapped } from "./serialize.js";

export type DehydratedState = {
  queries: Record<string, SerializedWrapped>;
  models: Record<string, Record<string, unknown>>;
  /** Signed channel grants for this render's states (rxfy-server's hydration()); the client
   *  live stack lifts these and subscribes. Absent for store-only SSR. */
  grants?: string[];
};

/** Serializes the registry's query cache (ids) and model stores (entities) to a JSON-safe snapshot. */
export function dehydrate(registry: IModelRegistry): DehydratedState {
  const queries: DehydratedState["queries"] = {};
  for (const [key, wrapped] of registry.queries.entries()) {
    const serialized = serializeWrapped(wrapped);
    if (serialized) queries[key] = serialized;
  }

  const models: DehydratedState["models"] = {};
  for (const { descriptor, store } of registry.stores()) {
    models[descriptor.name] = Object.fromEntries(store.valueEntries());
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
