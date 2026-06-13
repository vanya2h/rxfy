import _ from "lodash";
import { useMemo, useState } from "react";
import { createFulfilled, createPending, createRejected, isSyncMarked, type IWrapped, StatusEnum } from "rxfy";
import { catchError, concat, distinctUntilChanged, isObservable, map, Observable, of } from "rxjs";
import { useObservable } from "./useObservable.js";

export type ObservableLike<T> = Observable<T> | T;

function toObservable<T>(val: ObservableLike<T>): Observable<T> {
  if (isObservable(val)) return val;
  return of(val);
}

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
 * Tracks an observable as an IWrapped status for rendering.
 *
 * Contract: `source$` must be referentially stable across renders (memoize it, e.g. from
 * useStateData or useMemo). A new identity restarts the pipeline from PENDING — intended for
 * genuine source changes (new params / reload), but an observable created inline in render
 * restarts every render and never settles.
 *
 * Reload is not part of the status object; trigger it via the StateHandle's reload()
 * or getAttachedReload(source$).
 */
export function usePending<T>(
  source$: ObservableLike<T>,
  getDefaultValue?: () => T,
): IWrapped<T, StatusEnum.PENDING | StatusEnum.FULFILLED | StatusEnum.REJECTED> {
  const [initialProbe] = useState(() => probeSync(source$));

  const target$ = useMemo(() => {
    const emitsSync = isObservable(source$) && isSyncMarked(source$);
    const pendingEmission = getDefaultValue || emitsSync ? [] : [of<IWrapped<T>>(createPending())];
    return concat(
      ...pendingEmission,
      toObservable(source$).pipe(
        map((value): IWrapped<T> => createFulfilled(value)),
        catchError((error) => of<IWrapped<T>>(createRejected(error))),
      ),
    ).pipe(distinctUntilChanged(_.isEqual));
  }, [source$, getDefaultValue]);

  const initialState = useMemo<IWrapped<T>>(() => {
    if (initialProbe?.kind === "value") return createFulfilled(initialProbe.value);
    if (initialProbe?.kind === "error") return createRejected(initialProbe.error);
    if (getDefaultValue) return createFulfilled(getDefaultValue());
    return createPending();
  }, [initialProbe, getDefaultValue]);

  return useObservable(target$, initialState);
}
