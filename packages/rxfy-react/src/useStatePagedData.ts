import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ModelDescriptor, StateDescriptor } from "rxfy";
import { array, attachReload, getAttachedReload, isSyncMarked, markSync, normalizeResult } from "rxfy";
import { map, type Observable } from "rxjs";
import { useModelRegistry } from "./registry-context.js";
import { useStateData } from "./useStateData.js";

export type PagedListHandle = {
  /** Entity ids of the accumulated list. Read entity data via `useModelStore(model)`. */
  readonly data$: Observable<string[]>;
  /** Fetch and append the next page. No-op while a load is in flight or once `hasMore` is false. */
  readonly loadMore: () => void;
  /** True while a `loadMore` fetch is in flight. */
  readonly isLoading: boolean;
  /** False once `config.hasMore` reports the list is exhausted (always true if `hasMore` is omitted). */
  readonly hasMore: boolean;
  /** Re-fetch page 0 and reset pagination. */
  readonly reload: () => void;
};

export type UseStatePagedDataConfig<T, TParams, TPage, TCursor> = {
  /** The entity model; the query is an array of it. Entities land in `useModelStore(model)`. */
  model: ModelDescriptor<T>;
  /** SSR / query-cache key. Omit to opt out of caching (fetch per mount). */
  key?: string;
  params: TParams;
  fetchPage: (args: { cursor: TCursor; params: TParams; signal: AbortSignal }) => Promise<TPage>;
  /** Compute the next cursor from the current list's ids and the running page index. */
  getCursor: (args: { ids: string[]; pageIndex: number }) => TCursor;
  /** The entities a page contributes — appended to the list. */
  select: (args: { page: TPage }) => T[];
  /** Omit for an infinite list. */
  hasMore?: (args: { page: TPage }) => boolean;
};

/** Internal single-field shape: the list is always `array(model)` under the field `items`. */
type ListShape<T> = { items: T[] };

export function useStatePagedData<T, TParams, TPage, TCursor>(
  config: UseStatePagedDataConfig<T, TParams, TPage, TCursor>,
): PagedListHandle {
  const { model, key, params } = config;
  const registry = useModelRegistry();

  // Callbacks are often fresh closures each render. Stash them so fetchFirst stays stable and
  // useStateData keeps its params-identity refetch.
  const cfgRef = useRef(config);
  useLayoutEffect(() => {
    cfgRef.current = config;
  });

  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const pageIndexRef = useRef(1); // page 0 is fetched by useStateData; loadMore starts at 1
  const idsRef = useRef<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMoreState] = useState(true);

  // A single-field state ({ items: array(model) }) reuses useStateData's cache / SSR / dedup.
  // paramsSchema is never read at runtime, so we don't build a zod schema for it.
  const state = useMemo(
    () =>
      ({ key, paramsSchema: undefined, fields: { items: array(model) }, mutations: {} }) as unknown as StateDescriptor<
        TParams,
        ListShape<T>
      >,
    [key, model],
  );

  // Page 0 is select(firstPage) returned as the full shape — flows through useStateData's
  // cache / SSR / hydration unchanged. Everything is read from cfgRef, so this stays stable.
  const fetchFirst = useCallback((p: TParams, signal: AbortSignal): Promise<ListShape<T>> => {
    const { fetchPage, getCursor, select, hasMore: hasMoreFn } = cfgRef.current;
    const cursor = getCursor({ ids: [], pageIndex: 0 });
    return fetchPage({ cursor, params: p, signal }).then((pg) => {
      hasMoreRef.current = hasMoreFn ? hasMoreFn({ page: pg }) : true;
      return { items: select({ page: pg }) };
    });
  }, []);

  const handle = useStateData(state, fetchFirst, params);

  // A new handle means params changed or reload() ran — start pagination over. Render state is
  // reset during render (React's "adjust state when a prop changes"); refs in the layout effect.
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
    idsRef.current = [];
  }, [handle]);

  // Unwrap the internal { items } shape to a bare id array, preserving the SSR sync marker and the
  // attached reload (a plain .pipe drops both symbol markers, breaking <Pending> / getAttachedReload).
  const data$ = useMemo(() => {
    const inner = handle.data$;
    const mapped = inner.pipe(map((shape) => shape.items));
    if (isSyncMarked(inner)) markSync(mapped);
    const reload = getAttachedReload(inner);
    if (reload) attachReload(mapped, reload);
    return mapped;
  }, [handle.data$]);

  // Keep idsRef current for getCursor + mirror hasMore into render state on each emission.
  useEffect(() => {
    const sub = data$.subscribe({
      next: (ids) => {
        idsRef.current = ids;
        setHasMoreState(hasMoreRef.current);
      },
      // data$ errors on REJECTED — already surfaced to consumers via <Pending>. Swallow here
      // (internal side-channel) to avoid RxJS's global unhandled-error path.
      error: () => {},
    });
    return () => sub.unsubscribe();
  }, [data$]);

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
        // Append-only: write just this page's entities (O(page)), then concat their ids onto the
        // list via setRaw — the rows already loaded are never re-normalized.
        const { items: newIds } = normalizeResult(registry, state.fields, { items: select({ page }) });
        handle.setRaw((prev) => ({ items: [...prev.items, ...newIds] }));
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

  return useMemo(
    () => ({ data$, loadMore, isLoading, hasMore, reload: handle.reload }),
    [data$, loadMore, isLoading, hasMore, handle.reload],
  );
}
