import _ from "lodash";
import { useMemo, useState } from "react";
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

export function usePending<T>(source$: ObservableLike<T>, getDefaultValue?: () => T): IPendingStatus<T> {
  const [nonce$] = useState(() => new BehaviorSubject(0));

  const target$ = useMemo(
    () =>
      nonce$.pipe(
        switchMap(() => {
          const pendingEmission = getDefaultValue ? [] : [of<IPendingStatus<T>>({ status: "pending" })];
          return concat(
            ...pendingEmission,
            toObservable(source$).pipe(
              map((value): IPendingStatus<T> => ({ status: "fulfilled", value })),
              catchError((error) =>
                of<IPendingStatus<T>>({
                  status: "rejected",
                  error,
                  onReload: () => nonce$.next(nonce$.getValue() + 1),
                }),
              ),
            ),
          );
        }),
        distinctUntilChanged(_.isEqual),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source$, nonce$, getDefaultValue],
  );

  const initialState = useMemo<IPendingStatus<T>>(
    () =>
      getDefaultValue
        ? { status: "fulfilled", value: getDefaultValue() }
        : { status: "pending" },
    [getDefaultValue],
  );

  return useObservable(target$, initialState);
}
