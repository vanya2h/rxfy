import type { IAtom } from "rxfy";
import { useObservable } from "./useObservable.js";

/**
 * Binds an IAtom (entity handle, field Lens, or plain Atom) to React as `[value, set]`.
 * `atom$` must be referentially stable across renders — `store.get(id)` already is (it returns
 * the entity's cell); memoize atoms you derive yourself (e.g. a Lens via useMemo).
 */
export function useAtom<T>(atom$: IAtom<T>): [T, (value: T) => void] {
  const value = useObservable(atom$, atom$.get());
  return [value, atom$.set];
}
