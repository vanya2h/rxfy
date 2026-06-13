import { filter, type Observable } from "rxjs";
import { Atom, type IAtom, createAtom } from "../atom/atom.js";
import { createLens } from "../lens/lens.js";
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
  /** Writable handle over a single entity's cell — for field Lenses and form binding. */
  entity: (key: EntityKey<T>) => IAtom<T>;
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
  const cells = new Map<string, Atom<T | undefined>>();

  const getCell = (key: string): Atom<T | undefined> => {
    let cell = cells.get(key);
    if (!cell) {
      cell = createAtom<T | undefined>(undefined);
      cells.set(key, cell);
    }
    return cell;
  };

  const set = (key: string, val: T): void => {
    getCell(key).set(val);
  };

  return {
    get: (key) => markSync(getCell(key).pipe(filter((v): v is T => v !== undefined))),
    set,
    setMany: (items) => items.forEach((item) => set(descriptor.getKey(item), item)),
    getValue: (key) => cells.get(key)?.get(),
    entity: (key) =>
      createLens<T | undefined, T>(getCell(key as string), {
        get: (source) => source as T,
        set: (current) => current,
      }),
    valueEntries: () => {
      const result: [string, T][] = [];
      for (const [key, cell] of cells) {
        const value = cell.get();
        if (value !== undefined) result.push([key, value]);
      }
      return result;
    },
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
