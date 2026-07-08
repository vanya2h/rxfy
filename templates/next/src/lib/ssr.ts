import {
  createFulfilled,
  createModelRegistry,
  dehydrate,
  type DehydratedState,
  normalizeResult,
  type QueryShapeOf,
  stableStringify,
  type StateDescriptor,
} from "rxfy";

/**
 * Server-side prefetch for the App Router. RSC has no script-injection seam, so we produce the
 * dehydrated snapshot before render and pass it down as a serializable prop (see app/page.tsx).
 * Runs the fetcher into a fresh per-request registry, normalizes the result, seeds the query cache
 * under the same key useStateData uses, and returns the snapshot for HydrateSnapshot to ingest.
 */
export async function prefetch<TParams, TShape>(
  // The state's query/writable shapes are left open (any) so plain-object fields aren't re-derived through QueryShapeOf<TShape>.
  state: StateDescriptor<TParams, TShape, any, any, any>,
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>,
  params: TParams,
): Promise<DehydratedState> {
  const registry = createModelRegistry();
  const result = await fetchFn(params, new AbortController().signal);
  const ids = normalizeResult(registry, state.fields, result);
  registry.queries.getQuery<QueryShapeOf<TShape>>(`${state.key}:${stableStringify(params)}`).set(createFulfilled(ids));
  return dehydrate(registry);
}
