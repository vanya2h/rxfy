import { useContext, useMemo, useState } from "react";
import type {
  Atom,
  FieldsMap,
  IWrapped,
  MutationDefs,
  QueryShapeOf,
  StateDescriptor,
  WritableQueryShapeOf,
} from "rxfy";
import {
  attachReload,
  createFulfilled,
  createIdle,
  createPending,
  createRejected,
  denormalizeValue,
  markSync,
  normalizeResult,
  normalizeWritable,
  stableStringify,
  stateChannel,
  StatusEnum,
} from "rxfy";
import { filter, merge, Observable, of, ReplaySubject, share, switchMap, throwError, timer } from "rxjs";
import { useLiveClient } from "./live-context.js";
import { useModelRegistry } from "./registry-context.js";
import { SsrContext } from "./StoreProvider.js";

/** A new value, or a function deriving it from the previous one — the `useState`-style setter union. */
export type Updater<T> = T | ((prev: T) => T);

export type BoundMutations<TShape, TMutations extends MutationDefs<TShape>> = {
  [K in keyof TMutations]: TMutations[K] extends (prev: TShape, ...args: infer A) => TShape
    ? (...args: A) => void
    : never;
};

export type StateHandle<
  TShape,
  TMutations extends MutationDefs<TShape> = Record<never, never>,
  TQuery = QueryShapeOf<TShape>,
  TWritable = WritableQueryShapeOf<TShape>,
> = {
  /** Normalized query state — entity ids plus plain field values. Read entity data through model stores. */
  readonly data$: Observable<TQuery>;
  readonly set: (value: Updater<TShape>) => void;
  /**
   * Low-level sibling of `set` that writes the **id shape** directly — no denormalize round-trip.
   * Entity slots accept ids, denormalized entities, or a mix; plain fields take their value. The
   * updater receives the current shape and must return the writable shape; it is a no-op until the
   * query is FULFILLED. Use for append / prepend / reorder / dedup where re-normalizing the whole
   * list (`set`) would be O(N).
   */
  readonly setRaw: (ids: TWritable | ((prev: TQuery) => TWritable)) => void;
  readonly reload: () => void;
  readonly mutations: BoundMutations<TShape, TMutations>;
  readonly updatesAvailable$: Observable<number>;
  readonly applyUpdates: () => void;
};

export type UseStateDataConfig<TParams, TShape, TMutations extends MutationDefs<TShape>, TQuery, TWritable> = {
  /** The typed, normalized state descriptor (`defineState`). */
  state: StateDescriptor<TParams, TShape, TMutations, TQuery, TWritable>;
  /** Fetches the full denormalized shape; `params` identity drives refetch. */
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>;
  params: TParams;
  /** Seed value (e.g. from a router loader) used until the first fetch settles. */
  defaultData?: TShape;
};

export function useStateData<TParams, TShape, TMutations extends MutationDefs<TShape>, TQuery, TWritable>({
  state,
  fetchFn,
  params,
  defaultData,
}: UseStateDataConfig<TParams, TShape, TMutations, TQuery, TWritable>): StateHandle<
  TShape,
  TMutations,
  TQuery,
  TWritable
> {
  const registry = useModelRegistry();
  const ssr = useContext(SsrContext);
  const liveClient = useLiveClient();

  // Re-subscribe epoch. Only ever bumped by a reload() that recovers from a terminal REJECTED: an
  // Rx error ends the subscription, so those consumers must resubscribe. Every other reload — and
  // FULFILLED → reload in particular — updates the shared atom in place and keeps data$ stable.
  const [reloadEpoch, setReloadEpoch] = useState(0);

  // Value-based key — params with the same shape resolve to the same query (and the same shared
  // atom). The memo keys off this string rather than `params`'s identity, so an
  // identity-unstable-but-value-stable params object does not churn data$.
  const paramsKey = stableStringify(params);
  const cacheKey = `${state.key}:${paramsKey}`;
  const channel = stateChannel(state, params as Record<string, unknown>);

  // `fetchFn`, `params` and `defaultData` are intentionally absent from the memo deps: data$ must
  // keep a stable identity across renders (directive: as stable as possible) and across a changing
  // `defaultData` (directive: a new defaultData must not reset the stream). The closure captures
  // them; `params`'s *value* is pinned by `paramsKey`/`cacheKey` in the deps, and `fetchFn` is
  // expected to be stable (module scope), so the captured values stay correct.
  return useMemo(() => {
    void reloadEpoch; // bumped by reload() only to force a resubscribe after a terminal REJECTED
    const fields = state.fields as FieldsMap;
    const isServer = typeof window === "undefined";

    // The query's status Atom, shared via the registry — every state with this key+params pair
    // reads and writes the same query.
    const atom$: Atom<IWrapped<TQuery>> = registry.queries.getQuery<TQuery>(cacheKey);

    // Seed the atom with defaultData (e.g. from a react-router loader) when it hasn't been populated
    // yet. Only the first-IDLE seed reads it, so a later defaultData change is intentionally ignored.
    // A loader payload may also carry the reserved `$grant`; lift it before normalizing so the key
    // never reaches the query. During SSR log it for hydration; with a live client, subscribe it.
    if (defaultData !== undefined && atom$.get().type === StatusEnum.IDLE) {
      const { $grant, ...payload } = defaultData as TShape & { $grant?: string };
      const query = normalizeResult(registry, fields, payload as TShape) as TQuery;
      atom$.set(createFulfilled(query));
      if (isServer && ssr && $grant !== undefined) registry.grants.add($grant);
      if ($grant !== undefined && liveClient) liveClient.subscribe($grant);
    }

    // Live-updates counter for this state's channel. Null when no live client or no channel key.
    // Defined before `settle` so the FULFILLED branch can reset it.
    const counter = liveClient && channel ? liveClient.channel(channel) : null;
    const updatesAvailable$: Observable<number> = counter ? counter.available$ : of(0);

    // `signal` is passed for client fetches so a teardown-aborted fetch is dropped instead of
    // latching a spurious result/REJECTED into the (possibly shared) query atom. SSR fetches
    // omit it (their throwaway signal never aborts), preserving the original behavior.
    const settle = (run: Promise<TShape>, signal?: AbortSignal) =>
      run.then(
        (result) => {
          if (signal?.aborted) return;
          // Lift the reserved `$grant` before normalizing so the key never reaches the query. A
          // grant marks a live endpoint (its claims enumerate the entities). During SSR, log it so
          // hydration embeds it; with a live client in context, subscribe it. Both conditions are
          // load-bearing: no grant → store-only endpoint; no live client → store-only app.
          const { $grant, ...payload } = result as TShape & { $grant?: string };
          const query = normalizeResult(registry, fields, payload as TShape) as TQuery;
          atom$.set(createFulfilled(query));
          if (isServer && ssr && $grant !== undefined) registry.grants.add($grant);
          if ($grant !== undefined && liveClient) liveClient.subscribe($grant);
          counter?.reset();
        },
        (error: unknown) => {
          if (signal?.aborted) return;
          atom$.set(createRejected(error));
        },
      );

    // Mutable holder for the one in-flight controller (initial fetch / reload / teardown). A plain
    // object so the deferred callbacks can swap it without reassigning a render-scoped binding.
    const inFlight: { controller?: AbortController } = {};

    // Flip the shared atom to PENDING and fetch into it; every subscriber reacts. Aborts any prior
    // in-flight request first, so the latest fetch always wins.
    const runFetch = () => {
      inFlight.controller?.abort();
      const controller = new AbortController();
      inFlight.controller = controller;
      atom$.set(createPending());
      void settle(fetchFn(params, controller.signal), controller.signal);
    };

    // SSR on-demand fetching: suspend on a cache miss; React re-renders when the promise settles.
    if (isServer && ssr && atom$.get().type === StatusEnum.IDLE) {
      // getOrStart dedups: `start` runs only on a cache miss, so a second component sharing this
      // cacheKey gets the existing in-flight promise and never re-enters PENDING or refetches.
      throw registry.queries.getOrStart(cacheKey, () => {
        atom$.set(createPending());
        return settle(fetchFn(params, new AbortController().signal));
      });
    }

    const toError = (error: unknown) => (error instanceof Error ? error : new Error(String(error)));

    // FULFILLED → value, REJECTED → error(throw), IDLE/PENDING → no emission (usePending shows
    // pending). The atom is a BehaviorSubject, so a FULFILLED → PENDING → FULFILLED cycle (reload)
    // keeps live subscriptions and re-emits — only a REJECTED terminates them (see reload()).
    const derived$ = atom$.pipe(
      filter((w) => w.type === StatusEnum.FULFILLED || w.type === StatusEnum.REJECTED),
      switchMap((w) => (w.type === StatusEnum.FULFILLED ? of(w.value) : throwError(() => toError(w.error)))),
    );

    let data$: Observable<TQuery>;
    const initialStatus = atom$.get().type;
    const settled = initialStatus === StatusEnum.FULFILLED || initialStatus === StatusEnum.REJECTED;
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
        if (atom$.get().type === StatusEnum.IDLE) runFetch();
        return () => {
          // Genuine teardown (refcount stayed at zero): roll an unsettled query back to IDLE so
          // the next subscriber refetches, then abort. settle() drops the abort rejection.
          if (atom$.get().type === StatusEnum.PENDING) atom$.set(createIdle());
          inFlight.controller?.abort();
        };
      });
      // ReplaySubject(1) connector so a late subscriber still receives the current value
      // (preserving the atom's BehaviorSubject replay semantics that consumers rely on);
      // resetOnRefCountZero clears that buffer on a genuine teardown.
      data$ = merge(derived$, fetchOnSubscribe$).pipe(
        share({ connector: () => new ReplaySubject(1), resetOnRefCountZero: () => timer(0) }),
      );
    }

    // Every explicit write commits FULFILLED and aborts any in-flight fetch, so a set / mutation
    // can't be clobbered by a late-arriving fetch result.
    const writeThrough = (ids: TQuery) => {
      inFlight.controller?.abort();
      atom$.set(createFulfilled(ids));
    };

    const applyUpdate = (updater: (prev: TShape) => TShape) => {
      const current = atom$.get();
      if (current.type !== StatusEnum.FULFILLED) return;
      const prev = denormalizeValue<TShape>(registry, fields, current.value as never);
      writeThrough(normalizeResult(registry, fields, updater(prev)) as TQuery);
    };

    const set = (valueOrUpdater: Updater<TShape>) => {
      if (typeof valueOrUpdater === "function") {
        applyUpdate(valueOrUpdater as (prev: TShape) => TShape);
      } else {
        writeThrough(normalizeResult(registry, fields, valueOrUpdater) as TQuery);
      }
    };

    const setRaw = (idsOrUpdater: TWritable | ((prev: TQuery) => TWritable)) => {
      if (typeof idsOrUpdater === "function") {
        const current = atom$.get();
        if (current.type !== StatusEnum.FULFILLED) return;
        const updater = idsOrUpdater as (prev: TQuery) => TWritable;
        writeThrough(normalizeWritable(registry, fields, updater(current.value) as never) as TQuery);
      } else {
        writeThrough(normalizeWritable(registry, fields, idsOrUpdater as never) as TQuery);
      }
    };

    const mutations = Object.fromEntries(
      Object.entries(state.mutations).map(([key, reducer]) => [
        key,
        (...args: unknown[]) =>
          applyUpdate((prev) => (reducer as (prev: TShape, ...a: unknown[]) => TShape)(prev, ...args)),
      ]),
    ) as BoundMutations<TShape, TMutations>;

    // Re-fetch into the shared atom in place — all subscribers see PENDING then the fresh result,
    // and data$ keeps its identity. The one exception: a subscription that already errored
    // (REJECTED) is terminal in Rx, so clear the error and bump the epoch to force a resubscribe.
    const reload = () => {
      if (atom$.get().type === StatusEnum.REJECTED) {
        atom$.set(createIdle());
        setReloadEpoch((e) => e + 1);
      } else {
        runFetch();
      }
    };

    attachReload(data$, reload);

    const applyUpdates = (): void => {
      counter?.reset();
      reload();
    };

    return { data$, set, setRaw, reload, mutations, updatesAvailable$, applyUpdates };
    // fetchFn/params/defaultData are deliberately excluded — see the note above the memo. params'
    // value is tracked via cacheKey/paramsKey; data$ identity stability depends on this exclusion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, registry, ssr, cacheKey, paramsKey, reloadEpoch, liveClient, channel]);
}
