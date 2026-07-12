import { Observable, Subject } from "rxjs";
import { Atom, createAtom, type IAtom } from "../atom/atom.js";
import { createQueryCache, type QueryCache } from "../query/query-cache.js";
import { type ChannelLog, createChannelLog } from "../state/channel-log.js";
import type { EntityKey, ModelDescriptor } from "./model.js";

export type ModelStore<TEntity> = {
  /**
   * Writable handle over a single entity's cell — synchronous reads, field Lenses, form binding.
   * Assumes the entity is already loaded (ids come from fulfilled states); accessing an unloaded
   * key throws. Use `getValue` for a non-throwing probe.
   */
  get: (key: EntityKey<TEntity>) => IAtom<TEntity>;
  set: (key: string, val: TEntity) => void;
  setMany: (items: TEntity[]) => void;
  /** Synchronous read of the latest value — used by denormalization and dehydration. */
  getValue: (key: string) => TEntity | undefined;
  valueEntries: () => [string, TEntity][];
  /**
   * Emits a key the first time its entity becomes present (the first `set`); updates to an existing
   * entity do not re-emit. New subscribers replay the keys already present, so a late subscriber
   * still learns about everything in the store. Lets a live-update layer track exactly what the
   * store holds without each query wiring its ids in by hand.
   */
  added$: Observable<string>;
};

export type AnyModelDescriptor = ModelDescriptor<any, any, any, any>;
/** Name-keyed record of registered descriptors — the shape accumulated by `createModelRegistry(seed).add(...)`. */
export type ModelsShape = Record<string, AnyModelDescriptor>;
type EntityOf<TDescriptor> = TDescriptor extends ModelDescriptor<infer TEntity, any, any, any> ? TEntity : never;

/**
 * `TModels` defaults to `any` so bare `IModelRegistry` stays the open registry: it accepts any
 * descriptor (today's lazy behavior) and every typed registry is assignable to it. Registries
 * built as `createModelRegistry(post).add(comment)` accumulate a name → descriptor record,
 * closing `model`/`store`/`stashHydration` over the registered set — a compile-time guard only;
 * runtime behavior is identical either way.
 */
export type IModelRegistry<TModels extends ModelsShape = any> = {
  /** Register a model into the type-level set and materialize its store; returns the same registry. */
  add: <TDescriptor extends AnyModelDescriptor>(
    descriptor: TDescriptor,
  ) => IModelRegistry<TModels & Record<TDescriptor["name"], TDescriptor>>;
  model: <TDescriptor extends TModels[keyof TModels]>(descriptor: TDescriptor) => ModelStore<EntityOf<TDescriptor>>;
  /** Typed store lookup by model name. Throws if the model was never materialized. */
  store: <TName extends keyof TModels & string>(name: TName) => ModelStore<EntityOf<TModels[TName]>>;
  /** SSR query cache — fulfilled/rejected entries keyed by state key + params. */
  queries: QueryCache;
  /** State channels materialized this request — read when signing the render's channel grants during SSR. */
  channels: ChannelLog;
  /** Keys are the registered model names; values the union of their stores (a Map cannot correlate value to key — use `store(name)` for a per-name type). */
  namedStores: () => ReadonlyMap<
    keyof TModels & string,
    { [K in keyof TModels]: ModelStore<EntityOf<TModels[K]>> }[keyof TModels]
  >;
  stores: () => { descriptor: AnyModelDescriptor; store: ModelStore<any> }[];
  /** Queue entities for a named model; seeds the store now if it exists, or on first creation otherwise. */
  stashHydration: <TName extends keyof TModels & string>(
    name: TName,
    entities: Record<string, EntityOf<TModels[TName]>>,
  ) => void;
  /**
   * Every entity added to any store, tagged with the model's `name` (the half of a `name:key`
   * topic). Replays what's already in the registry to new subscribers, and follows stores
   * created after subscribe. Useful for driving side effects off entity arrivals; live updates
   * subscribe to entity topics derived from the served payload, not per entity here.
   */
  added$: Observable<{ name: string; key: string }>;
};

export function createModelStore<TEntity>(descriptor: ModelDescriptor<TEntity>): ModelStore<TEntity> {
  // A cell exists iff its entity has been set, so the map (in insertion order) is also the
  // presence record replayed to new added$ subscribers.
  const cells = new Map<string, Atom<TEntity>>();
  const added = new Subject<string>();

  const set = (key: string, val: TEntity): void => {
    const cell = cells.get(key);
    if (cell) {
      cell.set(val); // re-set to an existing key is an update, not an add
    } else {
      cells.set(key, createAtom(val));
      added.next(key);
    }
  };

  return {
    get: (key) => {
      const cell = cells.get(key as string);
      if (!cell) {
        throw new Error(
          `rxfy: entity "${key}" for model "${descriptor.name}" is not loaded — ` +
            `read its id from a fulfilled state, or seed the store first`,
        );
      }
      return cell;
    },
    set,
    // Subscribe to future adds first, then replay the current snapshot — single-threaded, so a key
    // is delivered by exactly one path (no gap, no duplicate).
    added$: new Observable<string>((subscriber) => {
      const sub = added.subscribe(subscriber);
      for (const key of cells.keys()) subscriber.next(key);
      return sub;
    }),
    setMany: (items) => items.forEach((item) => set(descriptor.getKey(item), item)),
    getValue: (key) => cells.get(key)?.get(),
    valueEntries: () => [...cells].map(([key, cell]) => [key, cell.get()] as [string, TEntity]),
  };
}

// The seed argument starts typed accumulation (`createModelRegistry(post).add(comment)`); starting
// closed from an empty record would make the no-arg registry's `model()` reject everything.
export function createModelRegistry(): IModelRegistry;
export function createModelRegistry<TDescriptor extends AnyModelDescriptor>(
  seed: TDescriptor,
): IModelRegistry<Record<TDescriptor["name"], TDescriptor>>;
export function createModelRegistry(seed?: AnyModelDescriptor): IModelRegistry {
  const stores = new Map<symbol, ModelStore<any>>();
  const descriptors = new Map<symbol, ModelDescriptor<any>>();
  const named = new Map<string, ModelStore<any>>();
  const stash = new Map<string, Record<string, unknown>>();
  const queries = createQueryCache();
  const channels = createChannelLog();
  // Fires once per store as it's created, so added$ subscribers can hook stores born later.
  const namedCreated = new Subject<{ name: string; store: ModelStore<any> }>();

  const registry: IModelRegistry = {
    queries,
    channels,
    add: (descriptor) => {
      registry.model(descriptor);
      return registry;
    },
    store: (name) => {
      const store = named.get(name);
      if (!store) {
        throw new Error(`rxfy: no store named "${name}" — register the model with createModelRegistry(model)/.add()`);
      }
      return store;
    },
    model: <TEntity>(descriptor: ModelDescriptor<TEntity>): ModelStore<TEntity> => {
      if (!stores.has(descriptor._key)) {
        const store = createModelStore(descriptor);
        stores.set(descriptor._key, store);
        descriptors.set(descriptor._key, descriptor);
        if (named.has(descriptor.name)) {
          console.warn(`rxfy: duplicate model name "${descriptor.name}" — SSR dehydration would mix their entities`);
        }
        named.set(descriptor.name, store);
        const pending = stash.get(descriptor.name);
        if (pending) {
          stash.delete(descriptor.name);
          for (const [key, value] of Object.entries(pending)) store.set(key, value as TEntity);
        }
        // Announce after seeding: an already-subscribed added$ hooks the store now and replays
        // the just-stashed keys (the store buffered them as cells).
        namedCreated.next({ name: descriptor.name, store });
      }
      return stores.get(descriptor._key) as ModelStore<TEntity>;
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

  if (seed) registry.model(seed);
  return registry;
}
