import PQueue from "p-queue";
import { catchError, EMPTY, lastValueFrom, map, Observable, of, switchMap, take, tap, throwError } from "rxjs";
import { createFulfilled, createPending, createRejected, IWrapped, StatusEnum } from "../wrapped/wrapped.js";
import { IAtom } from "../atom/atom.js";

export type IBranded<TBrand, TData> = {
  brand: TBrand;
  value: TData;
};

export function toBranded<TBrand extends string, TData>(brand: TBrand, value: TData): IBranded<TBrand, TData> {
  return { value, brand };
}

export function isBranded<TBrand extends string, TData>(brand: TBrand, val: any): val is IBranded<TBrand, TData> {
  return val && typeof val === "object" && val.brand === brand;
}

export type IEdgeState<TData> = IWrapped<TData>;

export type IEdgeJS<TData> = IBranded<"edge", IEdgeState<TData>>;

export type IEdge<TData> = {
  subject$: IAtom<IEdgeState<TData>>;
  toObservable: () => Observable<TData>;
  next: () => Promise<IWrapped<TData, StatusEnum.FULFILLED | StatusEnum.REJECTED>>;
};

export function createEdge<TData>(
  state$: IAtom<IEdgeState<TData>>,
  queue: PQueue,
  loader: () => Observable<TData>,
): IEdge<TData> {
  const load = () => {
    state$.set(createPending());
    return lastValueFrom(
      loader().pipe(
        map((x) => createFulfilled(x)),
        catchError((x) => of(createRejected(x))),
        tap((x) => state$.set(x)),
        take(1),
      ),
    );
  };

  queue.add(async () => {
    const value = state$.get();
    if (value.type === StatusEnum.IDLE) {
      await load();
    }
  });

  return {
    subject$: state$,
    toObservable: () =>
      state$.pipe(
        switchMap((x) => {
          switch (x.type) {
            case StatusEnum.FULFILLED:
              return of(x.value);
            case StatusEnum.REJECTED:
              return throwError(() => x.error);
            default:
              return EMPTY;
          }
        }),
      ),
    next: () => load(),
  };
}
