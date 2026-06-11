import { useCallback, useMemo, useState } from "react";
import type { FieldDescriptor, FieldsMap, MutationDefs, StateDescriptor } from "rxfy";
import { BehaviorSubject, filter, Observable, Subscription } from "rxjs";
import { useModelRegistry } from "./registry-context.js";

export type BoundMutations<TShape, TMutations extends MutationDefs<TShape>> = {
  [K in keyof TMutations]: TMutations[K] extends (prev: TShape, ...args: infer A) => TShape
    ? (...args: A) => void
    : never;
};

export type StateHandle<TShape, TMutations extends MutationDefs<TShape> = Record<never, never>> = {
  readonly data$: Observable<TShape>;
  readonly set: (value: TShape | ((prev: TShape) => TShape)) => void;
  readonly reload: () => void;
  readonly mutations: BoundMutations<TShape, TMutations>;
};

export function useStateData<TParams, TShape, TMutations extends MutationDefs<TShape>>(
  state: StateDescriptor<TParams, TShape, TMutations>,
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>,
  params: TParams,
): StateHandle<TShape, TMutations> {
  const registry = useModelRegistry();
  const [reloadCounter, setReloadCounter] = useState(0);

  const normalize = useCallback(
    (value: TShape) => {
      const entries = Object.entries(state.fields as FieldsMap) as [string, FieldDescriptor<any>][];
      for (const [fieldName, fieldDesc] of entries) {
        const modelStore = registry.model(fieldDesc.model);
        const fieldValue = (value as Record<string, unknown>)[fieldName];
        if (fieldDesc.kind === "array") {
          modelStore.setMany(fieldValue as unknown[]);
        } else {
          modelStore.set(fieldDesc.model.getKey(fieldValue), fieldValue);
        }
      }
    },
    [state, registry],
  );

  return useMemo(() => {
    // reloadCounter is used here only to trigger a new subject when reload() is called
    void reloadCounter;
    // subject is shared between data$, set(), and mutations via closure — no ref needed
    const subject = new BehaviorSubject<TShape | null>(null);

    const data$ = new Observable<TShape>((subscriber) => {
      let innerSub: Subscription | undefined;
      const controller = new AbortController();

      fetchFn(params, controller.signal)
        .then((result) => {
          if (subscriber.closed) return;
          normalize(result);
          subject.next(result);
          innerSub = subject.pipe(filter((v): v is TShape => v !== null)).subscribe(subscriber);
        })
        .catch((err) => {
          if (!subscriber.closed) subscriber.error(err);
        });

      return () => {
        controller.abort();
        innerSub?.unsubscribe();
      };
    });

    const set = (valueOrUpdater: TShape | ((prev: TShape) => TShape)) => {
      const current = subject.getValue();
      let newValue: TShape;
      if (typeof valueOrUpdater === "function") {
        if (current === null) return;
        newValue = (valueOrUpdater as (prev: TShape) => TShape)(current);
      } else {
        newValue = valueOrUpdater;
      }
      normalize(newValue);
      subject.next(newValue);
    };

    const mutations = Object.fromEntries(
      Object.entries(state.mutations).map(([key, reducer]) => [
        key,
        (...args: unknown[]) => {
          const current = subject.getValue();
          if (current === null) return;
          const newValue = (reducer as (prev: TShape, ...args: unknown[]) => TShape)(current, ...args);
          normalize(newValue);
          subject.next(newValue);
        },
      ]),
    ) as BoundMutations<TShape, TMutations>;

    const reload = () => setReloadCounter((c) => c + 1);

    return { data$, set, reload, mutations };
  }, [params, fetchFn, reloadCounter, normalize, setReloadCounter, state]);
}
