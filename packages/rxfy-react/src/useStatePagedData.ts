import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FieldsMap, MutationDefs, QueryShapeOf, StateDescriptor } from "rxfy";
import { normalizeResult } from "rxfy";
import { useModelRegistry } from "./registry-context.js";
import { type StateHandle, useStateData } from "./useStateData.js";

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
  /** Empty seed `merge`d with page 0, e.g. `{ users: [] }`. */
  initial: TShape;
  fetchPage: (args: { cursor: TCursor; params: TParams; signal: AbortSignal }) => Promise<TPage>;
  /** Receives the normalized id shape (what `data$` emits) plus the running page index. */
  getCursor: (args: { ids: QueryShapeOf<TShape>; pageIndex: number }) => TCursor;
  /** Receives denormalized entities (like `set(prev => …)`); returns the next full shape. */
  merge: (args: { prev: TShape; page: TPage }) => TShape;
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

  // Normalized empty seed → QueryShapeOf, for page-0's getCursor. Stable per state/registry.
  // `config.initial` is intentionally excluded from the deps: it is a stable per-call-site seed,
  // and keying on its identity would rebuild fetchFirst (and the handle) on every render.
  const emptyIds = useMemo(
    () => normalizeResult(registry, state.fields as FieldsMap, config.initial) as QueryShapeOf<TShape>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registry, state],
  );

  // Latest normalized ids, read synchronously on the loadMore path. Seeded with the empty shape.
  const idsRef = useRef<QueryShapeOf<TShape>>(emptyIds);

  // Page 0 routes through fetchPage + merge so it returns TShape — SSR/cache/hydration unchanged.
  const fetchFirst = useCallback(
    (p: TParams, signal: AbortSignal) => {
      const { fetchPage, getCursor, merge, hasMore: hasMoreFn, initial: seed } = cfgRef.current;
      const cursor = getCursor({ ids: emptyIds, pageIndex: 0 });
      return fetchPage({ cursor, params: p, signal }).then((pg) => {
        hasMoreRef.current = hasMoreFn ? hasMoreFn({ page: pg }) : true;
        return merge({ prev: seed, page: pg });
      });
    },
    [emptyIds],
  );

  const handle = useStateData(state, fetchFirst, params);

  // Subscribe to data$ to keep idsRef current for the loadMore path (wired in a later task).
  useEffect(() => {
    const sub = handle.data$.subscribe((ids) => {
      idsRef.current = ids;
    });
    return () => sub.unsubscribe();
  }, [handle.data$]);

  const loadMore = useCallback(() => {
    void loadingRef;
    void pageIndexRef;
    void setIsLoading;
    void setHasMoreState;
    void handle; // loadMore is wired in a later task
  }, [handle]);

  return useMemo(() => ({ ...handle, loadMore, isLoading, hasMore }), [handle, loadMore, isLoading, hasMore]);
}
