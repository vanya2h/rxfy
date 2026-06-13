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
import { filter, Observable, of, switchMap, throwError } from "rxjs";
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
  readonly reload: () => void;
  readonly mutations: BoundMutations<TShape, TMutations>;
};

export function useStateData<TParams, TShape, TMutations extends MutationDefs<TShape>>(
  state: StateDescriptor<TParams, TShape, TMutations>,
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>,
  params: TParams,
): StateHandle<TShape, TMutations> {
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

    const settle = (run: Promise<TShape>) =>
      run.then(
        (result) => atom$.set(createFulfilled(normalizeResult(registry, fields, result))),
        (error: unknown) => atom$.set(createRejected(error)),
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
      // IDLE or shared in-flight PENDING: fetch on subscribe only if still IDLE, else just wait for settle
      data$ = new Observable<QueryShapeOf<TShape>>((subscriber) => {
        const sub = derived$.subscribe(subscriber);
        let controller: AbortController | undefined;
        if (atom$.get().type === StatusEnum.IDLE) {
          atom$.set(createPending());
          controller = new AbortController();
          void settle(fetchFn(params, controller.signal));
        }
        return () => {
          controller?.abort();
          sub.unsubscribe();
        };
      });
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

    return { data$, set, reload, mutations };
  }, [params, fetchFn, reloadCounter, state, registry, ssr]);
}
