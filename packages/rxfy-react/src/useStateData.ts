import { useContext, useMemo, useState } from "react";
import type { Atom, FieldsMap, IWrapped, MutationDefs, QueryShapeOf, StateDescriptor } from "rxfy";
import {
  attachReload,
  createAtom,
  createFulfilled,
  createIdle,
  createPending,
  createRejected,
  denormalizeValue,
  markSync,
  normalizeResult,
  stableStringify,
  StatusEnum,
} from "rxfy";
import { filter, merge, Observable, of, ReplaySubject, share, switchMap, throwError, timer } from "rxjs";
import { useModelRegistry } from "./registry-context.js";
import { SsrContext } from "./StoreProvider.js";

export type BoundMutations<TShape, TMutations extends MutationDefs<TShape>> = {
  [K in keyof TMutations]: TMutations[K] extends (prev: TShape, ...args: infer A) => TShape
    ? (...args: A) => void
    : never;
};

export type StateHandle<TShape, TMutations extends MutationDefs<TShape> = Record<never, never>> = {
  /** Normalized query state — entity ids only. Read entity data through model stores. */
  readonly data$: Observable<QueryShapeOf<TShape>>;
  readonly set: (value: TShape | ((prev: TShape) => TShape)) => void;
  /**
   * Low-level sibling of `set` that writes the normalized **id shape** directly — no normalize and
   * no denormalize round-trip. The caller is responsible for putting any new entities in their
   * model stores first (e.g. via `normalizeResult`). The updater form receives the current ids;
   * it is a no-op until the query is FULFILLED. Use for append / prepend / reorder / dedup where
   * re-normalizing the whole list (`set`) would be O(N).
   */
  readonly setRaw: (ids: QueryShapeOf<TShape> | ((prev: QueryShapeOf<TShape>) => QueryShapeOf<TShape>)) => void;
  readonly reload: () => void;
  readonly mutations: BoundMutations<TShape, TMutations>;
};

export type UseStateDataConfig<TParams, TShape, TMutations extends MutationDefs<TShape>> = {
  /** The typed, normalized state descriptor (`defineState`). */
  state: StateDescriptor<TParams, TShape, TMutations>;
  /** Fetches the full denormalized shape; `params` identity drives refetch. */
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>;
  params: TParams;
  /** Seed value (e.g. from a router loader) used until the first fetch settles. */
  defaultData?: TShape;
};

export function useStateData<TParams, TShape, TMutations extends MutationDefs<TShape>>({
  state,
  fetchFn,
  params,
  defaultData,
}: UseStateDataConfig<TParams, TShape, TMutations>): StateHandle<TShape, TMutations> {
  const registry = useModelRegistry();
  const ssr = useContext(SsrContext);
  const [reloadCounter, setReloadCounter] = useState(0);

  return useMemo(() => {
    void reloadCounter; // reload() bumps this to rebuild the handle
    const fields = state.fields as FieldsMap;
    const cacheKey = state.key ? `${state.key}:${stableStringify(params)}` : undefined;
    const isServer = typeof window === "undefined";

    // The query's status Atom. Keyed states share one via the registry; keyless states get a private one.
    const atom$: Atom<IWrapped<QueryShapeOf<TShape>>> = cacheKey
      ? registry.queries.getQuery<QueryShapeOf<TShape>>(cacheKey)
      : createAtom<IWrapped<QueryShapeOf<TShape>>>(createIdle());

    // Seed the atom with defaultData (e.g. from a react-router loader) when it hasn't been populated yet.
    if (defaultData !== undefined && atom$.get().type === StatusEnum.IDLE) {
      atom$.set(createFulfilled(normalizeResult(registry, fields, defaultData)));
    }

    // `signal` is passed for client fetches so a teardown-aborted fetch is dropped instead of
    // latching a spurious result/REJECTED into the (possibly shared) query atom. SSR fetches
    // omit it (their throwaway signal never aborts), preserving the original behavior.
    const settle = (run: Promise<TShape>, signal?: AbortSignal) =>
      run.then(
        (result) => {
          if (signal?.aborted) return;
          atom$.set(createFulfilled(normalizeResult(registry, fields, result)));
        },
        (error: unknown) => {
          if (signal?.aborted) return;
          atom$.set(createRejected(error));
        },
      );

    // SSR on-demand fetching: suspend on a cache miss; React re-renders when the promise settles.
    if (isServer && ssr && atom$.get().type === StatusEnum.IDLE) {
      if (!cacheKey) {
        console.warn('rxfy: state without "key" cannot be fetched during SSR — falling back to client fetch');
      } else {
        const inflight = registry.queries.getPromise(cacheKey);
        if (inflight) throw inflight; // dedup: another component already started this fetch
        atom$.set(createPending());
        const promise = settle(fetchFn(params, new AbortController().signal));
        registry.queries.setPromise(cacheKey, promise);
        throw promise;
      }
    }

    const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

    // REJECTED is only ever the terminal state of an initial fetch — post-FULFILLED writes
    // (set/mutations) are always FULFILLED — so erroring/tearing down the stream here is safe.
    // FULFILLED → value, REJECTED → error(throw), IDLE/PENDING → no emission (usePending shows pending).
    const derived$ = atom$.pipe(
      filter((w) => w.type === StatusEnum.FULFILLED || w.type === StatusEnum.REJECTED),
      switchMap((w) => (w.type === StatusEnum.FULFILLED ? of(w.value) : throwError(() => toError(w.error)))),
    );

    let data$: Observable<QueryShapeOf<TShape>>;
    const initial = atom$.get().type;
    const settled = initial === StatusEnum.FULFILLED || initial === StatusEnum.REJECTED;
    if (settled) {
      // cache hit / hydrated: emit synchronously, no fetch (markSync lets usePending probe it at render)
      data$ = markSync(derived$);
    } else {
      // IDLE or shared in-flight PENDING. Start the fetch as a subscribe-time side effect and
      // multicast via share(). The deferred resetOnRefCountZero (timer(0)) means a synchronous
      // unsubscribe→resubscribe — a StrictMode remount, or one of several subscribers leaving —
      // does NOT tear the fetch down: the re-subscription cancels the pending reset, so the
      // in-flight request survives instead of being aborted into a spurious REJECTED.
      const fetchOnSubscribe$ = new Observable<never>(() => {
        let controller: AbortController | undefined;
        if (atom$.get().type === StatusEnum.IDLE) {
          atom$.set(createPending());
          controller = new AbortController();
          void settle(fetchFn(params, controller.signal), controller.signal);
        }
        return () => {
          // Genuine teardown (refcount stayed at zero): roll an unsettled query back to IDLE so
          // the next subscriber refetches, then abort. settle() drops the abort rejection.
          if (controller && atom$.get().type === StatusEnum.PENDING) atom$.set(createIdle());
          controller?.abort();
        };
      });
      // ReplaySubject(1) connector so a late subscriber still receives the current value
      // (preserving the atom's BehaviorSubject replay semantics that consumers rely on);
      // resetOnRefCountZero clears that buffer on a genuine teardown.
      data$ = merge(derived$, fetchOnSubscribe$).pipe(
        share({ connector: () => new ReplaySubject(1), resetOnRefCountZero: () => timer(0) }),
      );
    }

    const writeThrough = (ids: QueryShapeOf<TShape>) => atom$.set(createFulfilled(ids));

    const applyUpdate = (updater: (prev: TShape) => TShape) => {
      const current = atom$.get();
      if (current.type !== StatusEnum.FULFILLED) return;
      const prev = denormalizeValue<TShape>(registry, fields, current.value);
      writeThrough(normalizeResult(registry, fields, updater(prev)));
    };

    const set = (valueOrUpdater: TShape | ((prev: TShape) => TShape)) => {
      if (typeof valueOrUpdater === "function") {
        applyUpdate(valueOrUpdater as (prev: TShape) => TShape);
      } else {
        writeThrough(normalizeResult(registry, fields, valueOrUpdater));
      }
    };

    const setRaw = (idsOrUpdater: QueryShapeOf<TShape> | ((prev: QueryShapeOf<TShape>) => QueryShapeOf<TShape>)) => {
      if (typeof idsOrUpdater === "function") {
        const current = atom$.get();
        if (current.type !== StatusEnum.FULFILLED) return;
        writeThrough((idsOrUpdater as (prev: QueryShapeOf<TShape>) => QueryShapeOf<TShape>)(current.value));
      } else {
        writeThrough(idsOrUpdater);
      }
    };

    const mutations = Object.fromEntries(
      Object.entries(state.mutations).map(([key, reducer]) => [
        key,
        (...args: unknown[]) =>
          applyUpdate((prev) => (reducer as (prev: TShape, ...a: unknown[]) => TShape)(prev, ...args)),
      ]),
    ) as BoundMutations<TShape, TMutations>;

    const reload = () => {
      if (cacheKey) registry.queries.delete(cacheKey);
      setReloadCounter((c) => c + 1);
    };

    attachReload(data$, reload);

    return { data$, set, setRaw, reload, mutations };
  }, [params, fetchFn, reloadCounter, state, registry, ssr, defaultData]);
}
