import { useEffect, useState } from "react";
import { type IWrapped, StatusEnum } from "rxfy";
import { BehaviorSubject, distinctUntilChanged, noop, skip, tap } from "rxjs";
import { IRenderable, render } from "./render.js";
import { ObservableLike, usePending } from "./usePending.js";

export type IPendingProps<T> = {
  value$: ObservableLike<T>;
  pending?: IRenderable<void>;
  rejected?: IRenderable<IWrapped<T, StatusEnum.REJECTED>>;
  children: IRenderable<T>;
  getDefaultValue?: () => T;
};

export function Pending<T>({
  value$,
  rejected = () => null,
  pending = null,
  children,
  getDefaultValue,
}: IPendingProps<T>) {
  const status = usePending(value$, getDefaultValue);

  useEffect(() => {
    if (status.type === StatusEnum.REJECTED) {
      console.error(status.error);
    }
  }, [status]);

  switch (status.type) {
    case StatusEnum.PENDING:
      return render(undefined, pending);
    case StatusEnum.REJECTED:
      return render(status, rejected);
    case StatusEnum.FULFILLED:
      return render(status.value, children);
    default:
      return null;
  }
}

export type IBehaviorSubjectRenderProps<T> = {
  value$: BehaviorSubject<T>;
  children: IRenderable<T>;
};

export function BehaviorSubjectRender<T>({ value$, children }: IBehaviorSubjectRenderProps<T>) {
  const [state, setState] = useState<T>(() => value$.getValue());

  useEffect(() => {
    const sub = value$
      .pipe(
        skip(1),
        distinctUntilChanged(),
        tap((x) => setState(x)),
      )
      .subscribe(noop);
    return () => sub.unsubscribe();
  }, [value$]);

  return render(state, children);
}
