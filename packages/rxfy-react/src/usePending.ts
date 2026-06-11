import _ from "lodash";
import { useCallback, useMemo, useRef, useState } from "react";
import { getAttachedReload, isSyncMarked } from "rxfy";
import {
  BehaviorSubject,
  catchError,
  concat,
  distinctUntilChanged,
  isObservable,
  map,
  Observable,
  of,
  switchMap,
} from "rxjs";
import { useObservable } from "./useObservable.js";

export type ObservableLike<T> = Observable<T> | T;

function toObservable<T>(val: ObservableLike<T>): Observable<T> {
  if (isObservable(val)) return val;
  return of(val);
}

type Status = "pending" | "rejected" | "fulfilled";

export type IPendingStatus<T, K extends Status = Status> = {
  pending: { status: "pending" };
  rejected: { status: "rejected"; error: unknown; onReload: () => void };
  fulfilled: { status: "fulfilled"; value: T };
}[K];

type ProbeResult<T> = { kind: "value"; value: T } | { kind: "error"; error: unknown } | null;

/**
 * Render-time probe for sync-marked sources (hydrated query state, seeded model stores).
 * Subscribes and immediately unsubscribes — only rxfy-controlled observables are marked,
 * so this never triggers user side effects.
 */
function probeSync<T>(source: ObservableLike<T>): ProbeResult<T> {
  if (!isObservable(source) || !isSyncMarked(source)) return null;
  let captured: ProbeResult<T> = null;
  const sub = source.subscribe({
    next: (value) => (captured = { kind: "value", value }),
    error: (error) => (captured = { kind: "error", error }),
  });
  sub.unsubscribe();
  return captured;
}

/**
 * Tracks an observable as a pending/fulfilled/rejected status for rendering.
 *
 * Contract: `source$` must be referentially stable across renders (memoize it, e.g. from
 * useStateData or useMemo). A new identity restarts the pipeline from "pending" — intended for
 * genuine source changes (new params), but an observable created inline in render restarts
 * every render and never settles.
 */
export function usePending<T>(source$: ObservableLike<T>, getDefaultValue?: () => T): IPendingStatus<T> {
  const [nonce$] = useState(() => new BehaviorSubject(0));
  const [initialProbe] = useState(() => probeSync(source$));

  // Identity-stable across renders (source read via ref) so rejected statuses stay deep-equal
  // when the source observable is recreated each render — see useObservable's loop guard.
  const sourceRef = useRef(source$);
  sourceRef.current = source$;
  const reload = useCallback(() => {
    const source = sourceRef.current;
    const attached = isObservable(source) ? getAttachedReload(source) : undefined;
    if (attached) attached();
    else nonce$.next(nonce$.getValue() + 1);
  }, [nonce$]);

  const target$ = useMemo(
    () =>
      nonce$.pipe(
        switchMap(() => {
          const emitsSync = isObservable(source$) && isSyncMarked(source$);
          const pendingEmission = getDefaultValue || emitsSync ? [] : [of<IPendingStatus<T>>({ status: "pending" })];
          return concat(
            ...pendingEmission,
            toObservable(source$).pipe(
              map((value): IPendingStatus<T> => ({ status: "fulfilled", value })),
              catchError((error) =>
                of<IPendingStatus<T>>({
                  status: "rejected",
                  error,
                  onReload: reload,
                }),
              ),
            ),
          );
        }),
        distinctUntilChanged(_.isEqual),
      ),
    [source$, nonce$, getDefaultValue, reload],
  );

  const initialState = useMemo<IPendingStatus<T>>(() => {
    if (initialProbe?.kind === "value") return { status: "fulfilled", value: initialProbe.value };
    if (initialProbe?.kind === "error") return { status: "rejected", error: initialProbe.error, onReload: reload };
    if (getDefaultValue) return { status: "fulfilled", value: getDefaultValue() };
    return { status: "pending" };
  }, [initialProbe, getDefaultValue, reload]);

  return useObservable(target$, initialState);
}
