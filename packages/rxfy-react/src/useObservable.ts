import _ from "lodash";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { Observable } from "rxjs";

export function useObservable<T>(observable: Observable<T>, initialValue: T): T;
export function useObservable<T>(observable: Observable<T>): T | undefined;
export function useObservable<T>(observable: Observable<T>, initialValue?: T): T | undefined {
  const valueRef = useRef<T | undefined>(initialValue);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const sub = observable.subscribe({
        next: (value) => {
          // Equal-but-fresh emissions must not re-render: when the observable's identity changes
          // every render (inline-created sources), each resubscription re-emits an equal value —
          // notifying React would re-render, rebuild the source, and loop forever.
          if (_.isEqual(valueRef.current, value)) return;
          valueRef.current = value;
          onChange();
        },
      });
      return () => sub.unsubscribe();
    },
    [observable],
  );

  return useSyncExternalStore(
    subscribe,
    () => valueRef.current,
    () => initialValue,
  );
}
