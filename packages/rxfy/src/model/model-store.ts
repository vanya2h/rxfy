import { Observable, ReplaySubject } from "rxjs";
import type { ModelDescriptor } from "./model.js";

export type ModelStore<T> = {
  get: (key: string) => Observable<T>;
  set: (key: string, val: T) => void;
  setMany: (items: T[]) => void;
};

export type IModelRegistry = {
  model: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>;
};

export function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T> {
  const subjects = new Map<string, ReplaySubject<T>>();

  const getSubject = (key: string): ReplaySubject<T> => {
    if (!subjects.has(key)) {
      subjects.set(key, new ReplaySubject<T>(1));
    }
    return subjects.get(key)!;
  };

  return {
    get: (key) => getSubject(key).asObservable(),
    set: (key, val) => getSubject(key).next(val),
    setMany: (items) => items.forEach((item) => getSubject(descriptor.getKey(item)).next(item)),
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
