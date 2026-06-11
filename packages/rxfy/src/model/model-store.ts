import { Observable, ReplaySubject } from "rxjs";
import { markSync } from "../ssr/sync-marker.js";
import type { ModelDescriptor } from "./model.js";

export type ModelStore<T> = {
  get: (key: string) => Observable<T>;
  set: (key: string, val: T) => void;
  setMany: (items: T[]) => void;
  /** Synchronous read of the latest value — used by denormalization and dehydration. */
  getValue: (key: string) => T | undefined;
  valueEntries: () => [string, T][];
};

export type IModelRegistry = {
  model: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>;
};

export function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T> {
  const subjects = new Map<string, ReplaySubject<T>>();
  const values = new Map<string, T>();

  const getSubject = (key: string): ReplaySubject<T> => {
    if (!subjects.has(key)) {
      subjects.set(key, new ReplaySubject<T>(1));
    }
    return subjects.get(key)!;
  };

  const set = (key: string, val: T): void => {
    values.set(key, val);
    getSubject(key).next(val);
  };

  return {
    get: (key) => markSync(getSubject(key).asObservable()),
    set,
    setMany: (items) => items.forEach((item) => set(descriptor.getKey(item), item)),
    getValue: (key) => values.get(key),
    valueEntries: () => [...values.entries()],
  };
}

export function createModelRegistry(): IModelRegistry {
  const stores = new Map<symbol, ModelStore<any>>();

  return {
    model: <T>(descriptor: ModelDescriptor<T>): ModelStore<T> => {
      if (!stores.has(descriptor._key)) {
        stores.set(descriptor._key, createModelStore(descriptor));
      }
      return stores.get(descriptor._key) as ModelStore<T>;
    },
  };
}
