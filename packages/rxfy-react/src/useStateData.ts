import { useMemo } from "react";
import { combineLatest, map, Observable, of, Subscription } from "rxjs";
import type { StateDescriptor } from "rxfy";
import { useModelRegistry } from "./registry-context.js";

export function useStateData<TParams, TShape>(
  state: StateDescriptor<TParams, TShape>,
  fetchFn: (params: TParams) => Promise<TShape>,
  params: TParams,
): Observable<TShape> {
  const registry = useModelRegistry();

  return useMemo(
    () =>
      new Observable<TShape>((subscriber) => {
        let innerSub: Subscription | undefined;

        fetchFn(params)
          .then((result) => {
            if (subscriber.closed) return;

            const entries = Object.entries(state.fields);

            // Normalize all fields into their model stores
            for (const [fieldName, fieldDesc] of entries) {
              const modelStore = registry.model(fieldDesc.model);
              const value = (result as Record<string, unknown>)[fieldName];
              if (fieldDesc.kind === "array") {
                modelStore.setMany(value as unknown[]);
              } else {
                modelStore.set(fieldDesc.model.getKey(value), value);
              }
            }

            // Build reactive projection from model stores
            const fieldObservables = entries.map(([fieldName, fieldDesc]) => {
              const modelStore = registry.model(fieldDesc.model);
              const value = (result as Record<string, unknown>)[fieldName];
              if (fieldDesc.kind === "array") {
                const items = value as unknown[];
                if (items.length === 0) return of([]);
                const keys = items.map((item) => fieldDesc.model.getKey(item));
                return combineLatest(keys.map((k) => modelStore.get(k)));
              } else {
                return modelStore.get(fieldDesc.model.getKey(value));
              }
            });

            const fieldNames = entries.map(([name]) => name);

            const projection$ =
              fieldObservables.length === 0
                ? of({} as TShape)
                : combineLatest(fieldObservables).pipe(
                    map((values) => {
                      const shaped: Record<string, unknown> = {};
                      fieldNames.forEach((name, i) => {
                        shaped[name] = values[i];
                      });
                      return shaped as TShape;
                    }),
                  );

            innerSub = projection$.subscribe(subscriber);
          })
          .catch((err) => {
            if (!subscriber.closed) subscriber.error(err);
          });

        return () => innerSub?.unsubscribe();
      }),
    // params is intentionally compared by reference — callers should stabilize with useState/useMemo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, fetchFn, params, registry],
  );
}
