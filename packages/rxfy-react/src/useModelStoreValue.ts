import { useMemo } from "react";
import type { AnyModelDescriptor, EntityOfModel, StoreKey } from "rxfy";
import { EMPTY, type Observable } from "rxjs";
import { useModelStore } from "./useModelStore.js";
import { useObservable } from "./useObservable.js";

/**
 * Non-throwing reactive read of a single entity by id. Returns `undefined` while the id is `null`/
 * absent or the entity is not yet loaded, then the entity once present. Use for components that may
 * render whether or not a relation was joined; use `store.get` when the entity is guaranteed loaded.
 */
export function useModelStoreValue<TDescriptor extends AnyModelDescriptor>(
  model: TDescriptor,
  id: StoreKey<EntityOfModel<TDescriptor>> | null | undefined,
): EntityOfModel<TDescriptor> | undefined {
  const store = useModelStore(model);
  const source: Observable<EntityOfModel<TDescriptor> | undefined> = useMemo(
    () => (id == null ? EMPTY : store.observe(id)),
    [store, id],
  );
  return useObservable(source, undefined);
}
