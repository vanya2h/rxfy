import { Observable, BehaviorSubject } from "rxjs";

export type IAtom<T> = Observable<T> & {
  get: () => T;
  set: (val: T) => void;
  modify: (fn: (val: T) => T) => void;
};

export class Atom<T> extends Observable<T> implements IAtom<T> {
  readonly subject$: BehaviorSubject<T>;

  constructor(value: T) {
    const subject$ = new BehaviorSubject(value);

    super((subscriber) => {
      const sub = subject$.subscribe(subscriber);
      return () => sub.unsubscribe();
    });

    this.subject$ = subject$;
  }

  get = () => this.subject$.getValue();
  set = (val: T) => this.subject$.next(val);
  modify = (fn: (val: T) => T): void => this.set(fn(this.get()));
}

export function createAtom<T>(value: T) {
  return new Atom(value);
}
