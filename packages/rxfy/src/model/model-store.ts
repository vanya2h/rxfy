import { filter, Observable, Subject } from "rxjs";
import { Atom, createAtom, type IAtom } from "../atom/atom.js";
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
  /**
   * Writable handle over a single entity's cell — for field Lenses and form binding.
   * Assumes the entity is already loaded; returns `undefined` typed as `T` if the key has not been set.
   */
  entity: (key: EntityKey<T>) => IAtom<T>;
  /**
   * Emits a key the first time its entity becomes present (the first `set`); updates to an existing
   * entity do not re-emit. New subscribers replay the keys already present, so a late subscriber
   * still learns about everything in the store. Lets a live-update layer track exactly what the
   * store holds without each query wiring its ids in by hand.
   */
  added$: Observable<string>;
};

export type IModelRegistry = {
  model: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>;
  /** SSR query cache — fulfilled/rejected entries keyed by state key + params. */
  queries: QueryCache;
  namedStores: () => ReadonlyMap<string, ModelStore<any>>;
  stores: () => { descriptor: ModelDescriptor<any>; store: ModelStore<any> }[];
  /** Queue entities for a named model; seeds the store now if it exists, or on first creation otherwise. */
  stashHydration: (name: string, entities: Record<string, unknown>) => void;
  /**
   * Every entity added to any *named* store, tagged with that store's `name` (the half of a
   * `name:key` topic). Unnamed stores are skipped — there's no name to address them by. Replays
   * what's already in the registry to new subscribers, and follows stores created after subscribe.
   * A live-update client can drive its subscriptions straight off this instead of per-query wiring.
   */
  added$: Observable<{ name: string; key: string }>;
};

export function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T> {
  const cells = new Map<string, Atom<T | undefined>>();
  // Keys with a present value, in insertion order — the snapshot replayed to new added$ subscribers.
  const present = new Set<string>();
  const added = new Subject<string>();

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
    // First appearance only: record it and announce. Re-sets to an existing key are updates, not adds.
    if (val !== undefined && !present.has(key)) {
      present.add(key);
      added.next(key);
    }
  };

  return {
    get: (key) => markSync(getCell(key).pipe(filter((v): v is T => v !== undefined))),
    set,
    // Subscribe to future adds first, then replay the current snapshot — single-threaded, so a key
    // is delivered by exactly one path (no gap, no duplicate).
    added$: new Observable<string>((subscriber) => {
      const sub = added.subscribe(subscriber);
      for (const key of present) subscriber.next(key);
      return sub;
    }),
    setMany: (items) => items.forEach((item) => set(descriptor.getKey(item), item)),
    getValue: (key) => cells.get(key)?.get(),
    entity: (key) =>
      createLens<T | undefined, T>(getCell(key as string), {
        get: (source) => {
          if (source === undefined) {
            throw new Error(
              `rxfy: entity "${key}" for model "${descriptor.name ?? "<unnamed>"}" is not loaded — ` +
                `guard with <Pending>/useEntity or seed it first`,
            );
          }
          return source;
        },
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
  // Fires once per named store as it's created, so added$ subscribers can hook stores born later.
  const namedCreated = new Subject<{ name: string; store: ModelStore<any> }>();

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
          // Announce after seeding: an already-subscribed added$ hooks the store now and replays
          // the just-stashed keys (the store buffered them in `present`).
          namedCreated.next({ name: descriptor.name, store });
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
    added$: new Observable<{ name: string; key: string }>((subscriber) => {
      const subs = [namedCreated.subscribe(({ name, store }) => hook(name, store))];
      function hook(name: string, store: ModelStore<any>) {
        subs.push(store.added$.subscribe((key) => subscriber.next({ name, key })));
      }
      // Hook stores that already exist (their added$ replays their present keys); namedCreated
      // covers any born later. Existing stores never go through namedCreated, so no double-hook.
      for (const [name, store] of named) hook(name, store);
      return () => subs.forEach((s) => s.unsubscribe());
    }),
  };
}
