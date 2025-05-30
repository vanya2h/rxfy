import { Observable, BehaviorSubject, Subscription } from "rxjs";
import { distinctUntilChanged, map, tap } from "rxjs/operators";
import { isEqual } from "lodash";
import { IAtom } from "../atom/atom.js";

export type ILens<TSource, TTarget> = {
  get: (source: TSource) => TTarget;
  set: (current: TTarget, source: TSource) => TSource;
};

export class Lens<TSource, TTarget> extends Observable<TTarget> implements IAtom<TTarget> {
  private subject$: BehaviorSubject<TTarget>;
  private sub: Subscription | undefined;
  private subCount = 0;

  constructor(source$: IAtom<TSource>, lens: ILens<TSource, TTarget>) {
    const initialValue = lens.get(source$.get());
    const subject$ = new BehaviorSubject<TTarget>(initialValue);

    super((subscriber) => {
      const localSub = subject$.subscribe(subscriber);
      if (this.subCount++ === 0) {
        this.sub = new Subscription();

        this.sub.add(
          source$
            .pipe(
              map((x) => lens.get(x)),
              distinctUntilChanged(isEqual),
              tap((x) => {
                const prev = subject$.getValue();
                if (!isEqual(prev, x)) {
                  subject$.next(x);
                }
              }),
            )
            .subscribe(),
        );

        this.sub.add(
          subject$
            .pipe(
              distinctUntilChanged(isEqual),
              tap((next) => {
                const value = source$.get();
                const updated = lens.set(next, value);
                if (!isEqual(updated, value)) {
                  source$.set(updated);
                }
              }),
            )
            .subscribe(),
        );

        return () => {
          localSub.unsubscribe();
          if (--this.subCount === 0) {
            this.sub?.unsubscribe();
            this.sub = undefined;
          }
        };
      }
    });

    this.subject$ = subject$;
  }

  set = (value: TTarget) => this.subject$.next(value);
  get = () => this.subject$.getValue();
  modify = (fn: (val: TTarget) => TTarget) => this.set(fn(this.get()));
}

export function createLens<TSource, TTarget>(source$: IAtom<TSource>, lens: ILens<TSource, TTarget>) {
  return new Lens(source$, lens);
}

export function keyLens<TSource, TTarget extends keyof TSource>(key: TTarget): ILens<TSource, TSource[TTarget]> {
  return {
    get: (source: TSource) => source[key],
    set: (current: TSource[TTarget], source: TSource): TSource => ({
      ...source,
      [key]: current,
    }),
  };
}
