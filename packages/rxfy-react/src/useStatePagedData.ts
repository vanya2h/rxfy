import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FieldsMap, MutationDefs, QueryShapeOf, StateDescriptor } from "rxfy";
import { normalizeResult } from "rxfy";
import { useModelRegistry } from "./registry-context.js";
import { type StateHandle, useStateData } from "./useStateData.js";

/** Concatenate a freshly-normalized page's ids onto the current query ids (single fields replace). */
function appendIds<TShape>(
  fields: FieldsMap,
  prev: QueryShapeOf<TShape>,
  pageShape: Partial<TShape>,
  pageIds: QueryShapeOf<Partial<TShape>>,
): QueryShapeOf<TShape> {
  const prevRec = prev as Record<string, unknown>;
  const addedRec = pageIds as Record<string, unknown>;
  const next: Record<string, unknown> = { ...prevRec };
  for (const [field, desc] of Object.entries(fields)) {
    if (!(field in (pageShape as object))) continue;
    next[field] =
      desc.kind === "array" ? [...(prevRec[field] as unknown[]), ...(addedRec[field] as unknown[])] : addedRec[field];
  }
  return next as QueryShapeOf<TShape>;
}

export type PagedStateHandle<TShape, TMutations extends MutationDefs<TShape> = Record<never, never>> = StateHandle<
  TShape,
  TMutations
> & {
  /** Fetch and append the next page. No-op while a load is in flight or once `hasMore` is false. */
  readonly loadMore: () => void;
  /** True while a `loadMore` fetch is in flight. */
  readonly isLoading: boolean;
  /** False once `config.hasMore` reports the list is exhausted (always true if `hasMore` is omitted). */
  readonly hasMore: boolean;
};

export type UseStatePagedDataConfig<TParams, TShape, TPage, TCursor, TMutations extends MutationDefs<TShape>> = {
  state: StateDescriptor<TParams, TShape, TMutations>;
  params: TParams;
  fetchPage: (args: { cursor: TCursor; params: TParams; signal: AbortSignal }) => Promise<TPage>;
  /** Receives the normalized id shape (what `data$` emits) plus the running page index. */
  getCursor: (args: { ids: QueryShapeOf<TShape>; pageIndex: number }) => TCursor;
  /**
   * The entities a page contributes, keyed by model field — appended to the list, not merged with
   * the previous one. On page 0 it must include every array field (it seeds the first shape).
   */
  select: (args: { page: TPage }) => Partial<TShape>;
  /** Omit for an infinite list. */
  hasMore?: (args: { page: TPage }) => boolean;
};

export function useStatePagedData<TParams, TShape, TPage, TCursor, TMutations extends MutationDefs<TShape>>(
  config: UseStatePagedDataConfig<TParams, TShape, TPage, TCursor, TMutations>,
): PagedStateHandle<TShape, TMutations> {
  const { state, params } = config;
  const registry = useModelRegistry();

  // Callbacks are often fresh closures each render. Stash them in a ref so the synthesized
  // fetchFirst stays referentially stable and useStateData keeps its params-identity refetch.
  const cfgRef = useRef(config);
  useLayoutEffect(() => {
    cfgRef.current = config;
  });

  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pageIndexRef = useRef(1); // page 0 is fetched by useStateData; loadMore starts at 1
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMoreState] = useState(true);

  // Empty id shape (array fields → []) for page-0's getCursor. Built straight from the field map —
  // no seed value and no normalize pass needed.
  const emptyIds = useMemo(() => {
    const ids: Record<string, unknown> = {};
    for (const [field, desc] of Object.entries(state.fields as FieldsMap)) ids[field] = desc.kind === "array" ? [] : "";
    return ids as QueryShapeOf<TShape>;
  }, [state]);

  // Latest normalized ids, read synchronously on the loadMore path. Seeded with the empty shape.
  const idsRef = useRef<QueryShapeOf<TShape>>(emptyIds);

  // Page 0 goes through useStateData as a normal fetch returning the full shape — select() on the
  // first page yields exactly that shape — so cache / SSR / hydration are unchanged.
  const fetchFirst = useCallback(
    (p: TParams, signal: AbortSignal) => {
      const { fetchPage, getCursor, select, hasMore: hasMoreFn } = cfgRef.current;
      const cursor = getCursor({ ids: emptyIds, pageIndex: 0 });
      return fetchPage({ cursor, params: p, signal }).then((pg) => {
        hasMoreRef.current = hasMoreFn ? hasMoreFn({ page: pg }) : true;
        return select({ page: pg }) as TShape;
      });
    },
    [emptyIds],
  );

  const handle = useStateData(state, fetchFirst, params);

  // A new handle means params changed or reload() ran — start pagination over. Render state is
  // reset during render via React's documented "adjust state when a prop changes" pattern; the
  // refs are reset in the layout effect (synchronous at commit, before any child loadMore).
  const [trackedHandle, setTrackedHandle] = useState(handle);
  if (handle !== trackedHandle) {
    setTrackedHandle(handle);
    setIsLoading(false);
    setHasMoreState(true);
  }

  useLayoutEffect(() => {
    loadingRef.current = false;
    hasMoreRef.current = true;
    pageIndexRef.current = 1;
    idsRef.current = emptyIds;
  }, [handle, emptyIds]);

  // Keep idsRef current for the loadMore path and mirror hasMore into render state on each
  // emission (React bails out when the value is unchanged) — surfaces the page-0 result too.
  useEffect(() => {
    const sub = handle.data$.subscribe({
      next: (ids) => {
        idsRef.current = ids;
        setHasMoreState(hasMoreRef.current);
      },
      // data$ errors on REJECTED — already surfaced to consumers via <Pending>. Swallow here
      // (internal side-channel) to avoid RxJS's global unhandled-error path.
      error: () => {},
    });
    return () => sub.unsubscribe();
  }, [handle.data$]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);
    const { fetchPage, getCursor, select, hasMore: hasMoreFn } = cfgRef.current;
    const cursor = getCursor({ ids: idsRef.current, pageIndex: pageIndexRef.current });
    fetchPage({ cursor, params, signal: new AbortController().signal })
      .then((page) => {
        hasMoreRef.current = hasMoreFn ? hasMoreFn({ page }) : true;
        pageIndexRef.current += 1;
        // Append-only path: write just this page's entities (O(page)), then concat their ids onto
        // the current list via setRaw — no denormalize/re-normalize of the rows already loaded.
        const fields = state.fields as FieldsMap;
        const pageShape = select({ page });
        const pageIds = normalizeResult(registry, fields, pageShape);
        handle.setRaw((prev) => appendIds(fields, prev, pageShape, pageIds));
        setHasMoreState(hasMoreRef.current);
      })
      .catch(() => {
        // Leave the list as-is and allow a retry; the finally clears the in-flight guard.
      })
      .finally(() => {
        loadingRef.current = false;
        setIsLoading(false);
      });
  }, [handle, params, registry, state]);

  return useMemo(() => ({ ...handle, loadMore, isLoading, hasMore }), [handle, loadMore, isLoading, hasMore]);
}
