import { Observable, ReplaySubject } from "rxjs";
import { createQueryCache, type QueryCache } from "../query/query-cache.js";
import { markSync } from "../ssr/sync-marker.js";
import type { EntityKey, ModelDescriptor } from "./model.js";

export type ModelStore<T> = {
  get: (key: EntityKey<T>) => Observable<T>;
  set: (key: string, val: T) => void;
  setMany: (items: T[]) => void;
  /** Synchronous read of the latest value — used by denormalization and dehydration. */
  getValue: (key: string) => T | undefined;
  valueEntries: () => [string, T][];
};

export type IModelRegistry = {
  model: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>;
  /** SSR query cache — fulfilled/rejected entries keyed by state key + params. */
  queries: QueryCache;
  namedStores: () => ReadonlyMap<string, ModelStore<any>>;
  stores: () => { descriptor: ModelDescriptor<any>; store: ModelStore<any> }[];
  /** Queue entities for a named model; seeds the store now if it exists, or on first creation otherwise. */
  stashHydration: (name: string, entities: Record<string, unknown>) => void;
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
  const descriptors = new Map<symbol, ModelDescriptor<any>>();
  const named = new Map<string, ModelStore<any>>();
  const stash = new Map<string, Record<string, unknown>>();
  const queries = createQueryCache();

  return {
    queries,
    model: <T>(descriptor: ModelDescriptor<T>): ModelStore<T> => {
      if (!stores.has(descriptor._key)) {
        const store = createModelStore(descriptor);
        stores.set(descriptor._key, store);
        descriptors.set(descriptor._key, descriptor);
        if (descriptor.name) {
          if (named.has(descriptor.name)) {
            console.warn(`rxfy: duplicate model name "${descriptor.name}" — SSR dehydration would mix their entities`);
          }
          named.set(descriptor.name, store);
          const pending = stash.get(descriptor.name);
          if (pending) {
            stash.delete(descriptor.name);
            for (const [key, value] of Object.entries(pending)) store.set(key, value as T);
          }
        }
      }
      return stores.get(descriptor._key) as ModelStore<T>;
    },
    namedStores: () => named,
    stores: () => [...stores.keys()].map((key) => ({ descriptor: descriptors.get(key)!, store: stores.get(key)! })),
    stashHydration: (name, entities) => {
      const existing = named.get(name);
      if (existing) {
        for (const [key, value] of Object.entries(entities)) existing.set(key, value);
      } else {
        stash.set(name, { ...stash.get(name), ...entities });
      }
    },
  };
}
