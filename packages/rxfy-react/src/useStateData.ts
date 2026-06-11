import { useContext, useMemo, useState } from "react";
import type { FieldsMap, MutationDefs, QueryShapeOf, StateDescriptor } from "rxfy";
import {
  attachReload,
  denormalizeValue,
  markSync,
  normalizeResult,
  rehydrateError,
  serializeError,
  stableStringify,
} from "rxfy";
import { BehaviorSubject, filter, Observable, Subscription } from "rxjs";
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
    // reloadCounter is used here only to trigger a new handle when reload() is called
    void reloadCounter;
    const fields = state.fields as FieldsMap;
    const cacheKey = state.key ? `${state.key}:${stableStringify(params)}` : undefined;
    const isServer = typeof window === "undefined";
    const cached = cacheKey ? registry.queries.get<QueryShapeOf<TShape>>(cacheKey) : undefined;

    // SSR on-demand fetching: suspend on cache miss; React re-renders when the promise settles.
    if (isServer && ssr && !cached) {
      if (!cacheKey) {
        console.warn('rxfy: state without "key" cannot be fetched during SSR — falling back to client fetch');
      } else {
        const inflight = registry.queries.getPromise(cacheKey);
        if (inflight) throw inflight; // dedup: another component already started this fetch
        const promise = fetchFn(params, new AbortController().signal).then(
          (result) => {
            // normalize BEFORE the re-render so model-store subscriptions are live during SSR
            registry.queries.set(cacheKey, { status: "fulfilled", value: normalizeResult(registry, fields, result) });
          },
          (error: unknown) => {
            registry.queries.set(cacheKey, { status: "rejected", error: serializeError(error) });
          },
        );
        registry.queries.setPromise(cacheKey, promise);
        throw promise;
      }
    }

    const initialIds = cached?.status === "fulfilled" ? cached.value : null;
    // subject is shared between data$, set(), and mutations via closure
    const subject = new BehaviorSubject<QueryShapeOf<TShape> | null>(initialIds);
    const notNull = filter((v: QueryShapeOf<TShape> | null): v is QueryShapeOf<TShape> => v !== null);

    const writeThrough = (ids: QueryShapeOf<TShape>) => {
      subject.next(ids);
      if (cacheKey) registry.queries.set(cacheKey, { status: "fulfilled", value: ids });
    };

    let data$: Observable<QueryShapeOf<TShape>>;
    if (cached?.status === "rejected") {
      // hydrated rejection: error synchronously; entry persists until reload() deletes it
      const error = cached.error;
      data$ = markSync(
        new Observable<QueryShapeOf<TShape>>((subscriber) => {
          subscriber.error(rehydrateError(error));
        }),
      );
    } else if (initialIds !== null) {
      // cache hit: emit synchronously, no fetch
      data$ = markSync(subject.pipe(notNull));
    } else {
      // miss: fetch on subscribe (current behavior), normalize + write through on settle
      data$ = new Observable<QueryShapeOf<TShape>>((subscriber) => {
        // a previous subscription (or mutation) already populated this handle — reuse it;
        // reload() is the explicit re-fetch path
        if (subject.getValue() !== null) {
          const replaySub = subject.pipe(notNull).subscribe(subscriber);
          return () => replaySub.unsubscribe();
        }

        let innerSub: Subscription | undefined;
        const controller = new AbortController();

        fetchFn(params, controller.signal)
          .then((result) => {
            if (subscriber.closed) return;
            writeThrough(normalizeResult(registry, fields, result));
            innerSub = subject.pipe(notNull).subscribe(subscriber);
          })
          .catch((err: unknown) => {
            if (!subscriber.closed) subscriber.error(err);
          });

        return () => {
          controller.abort();
          innerSub?.unsubscribe();
        };
      });
    }

    const applyUpdate = (updater: (prev: TShape) => TShape) => {
      const currentIds = subject.getValue();
      if (currentIds === null) return;
      const prev = denormalizeValue<TShape>(registry, fields, currentIds);
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
