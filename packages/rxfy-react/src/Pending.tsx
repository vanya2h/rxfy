import { useEffect } from "react";
import { type IWrapped, StatusEnum } from "rxfy";
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
