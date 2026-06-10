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
