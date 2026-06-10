# Models & States — Design Spec

**Date:** 2026-06-10  
**Status:** Approved

---

## Overview

Add a normalized state management layer to rxfy: **Models** are Zod-schema-backed reactive key-value stores that act as single source of truth for entities. **States** compose models into a typed shape driven by params. React components use `useStateData` + `<Pending>` to fetch, normalize, and reactively render state — with zero manual store wiring.

`store.ts` (tree-shaped `IStore` with `factory`, `factoryBatch`, `node`, PQueue, branded state types) is **removed entirely**. The new system is built around a lean `ModelRegistry` that holds one `ModelStore<T>` per registered model. `ssr.ts` is also removed — SSR support for model stores is out of scope for this iteration.

---

## 1. Core Primitives (packages/rxfy)

### ModelDescriptor\<T\>

Module-level, stateless. Created once and reused everywhere.

```ts
type ModelDescriptor<T> = {
  readonly _key: symbol;                   // unique lookup key in registry
  readonly schema: z.ZodType<T>;
  readonly getKey: (item: T) => string;
};

function createModel<T>(
  schema: z.ZodType<T>,
  opts: { getKey: (item: T) => string },
): ModelDescriptor<T>
```

`_key` is a `Symbol()` created inside `createModel`. It is the stable identity of the model across all registry instances.

---

### Field helpers

Used inside `defineState` to describe the shape of a state field.

```ts
type FieldDescriptor<T> =
  | { kind: 'single'; model: ModelDescriptor<T> }
  | { kind: 'array';  model: ModelDescriptor<T> };   // T is the element type

function array<T>(model: ModelDescriptor<T>): FieldDescriptor<T[]>
function single<T>(model: ModelDescriptor<T>): FieldDescriptor<T>
```

---

### StateDescriptor\<TParams, TShape\>

Module-level, stateless. Describes which models compose a state and what params drive it.

```ts
type StateDescriptor<TParams, TShape> = {
  readonly paramsSchema: z.ZodType<TParams>;
  readonly fields: { [K in keyof TShape]: FieldDescriptor<TShape[K]> };
};

function defineState<TParams, TShape>(def: {
  params: z.ZodType<TParams>;
  model: { [K in keyof TShape]: FieldDescriptor<TShape[K]> };
}): StateDescriptor<TParams, TShape>
```

---

### ModelStore\<T\>

One instance per model per provider. Backed by `Map<string, Atom<T>>`.

```ts
type ModelStore<T> = {
  get: (key: string) => Observable<T>;   // creates Atom on first access
  set: (key: string, val: T) => void;
  setMany: (items: T[]) => void;         // uses descriptor.getKey per item
};
```

`setMany` calls `atom.set(val)` per key. All observers of that key receive the update immediately.

---

### IModelRegistry

Replaces `IStore` as the provider-scoped container. No PQueue, no tree hierarchy.

```ts
type IModelRegistry = {
  model: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>;
  getModelStore: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>;
};

function createModelRegistry(): IModelRegistry
```

`model()` creates a `ModelStore<T>` and registers it under `descriptor._key`. `getModelStore()` looks it up — throws if the model was never registered (i.e. `model()` was not called for it in `getInitial`).

---

## 2. File Layout

```
packages/rxfy/src/
  model/
    model.ts           ← createModel, array, single, ModelDescriptor, FieldDescriptor
    model-store.ts     ← ModelStore, createModelStore, IModelRegistry, createModelRegistry
  state/
    state.ts           ← defineState, StateDescriptor
  store/
    store.ts           ← REMOVED
    cache.ts           ← DELETED (was untracked scratch file)
    example.ts         ← DELETED (was untracked scratch file)
    example.test.ts    ← DELETED (was untracked scratch file)
    json.ts            ← DELETED (was untracked scratch file)
    ssss.tsx           ← DELETED (was the sketch file)
  index.ts             ← (modified) remove store.ts export, add model/state exports

packages/rxfy-react/src/
  useStateData.ts      ← main hook
  Pending.tsx          ← copied + adapted from common repo
  usePending.ts        ← copied + adapted from common repo
  useObservable.ts     ← copied + adapted from common repo
  render.ts            ← copied + adapted from common repo
  withData.tsx         ← REWRITTEN (ModelRegistry-based, no IStore dependency)
  ssr.ts               ← REMOVED (SSR out of scope)
  ssr.test.tsx         ← REMOVED (SSR out of scope)
  index.tsx            ← (modified) keep useEdge/Edge, add new exports
```

Kept in `packages/rxfy`: `atom.ts`, `edge.ts`, `wrapped.ts`, `lens.ts`, `batcher/`. These are standalone utilities with no dependency on `store.ts`. `useEdge` and `<Edge>` in `rxfy-react` continue to work as-is since they only depend on `edge.ts`.

---

## 3. Data Flow

### On mount / params change

Given:
```ts
const postModel = createModel(z.object({ id: z.string(), isPost: z.literal(true) }), {
  getKey: (x) => x.id,
});
const pageState = defineState({
  params: z.object({ page: z.number() }),
  model: { posts: array(postModel) },
});
```

1. `useStateData(pageState, fetchMainPage, { page: 0 })` returns a memoized cold Observable keyed on `params` identity.
2. `<Pending value$={state$}>` subscribes — `usePending` prepends `{ status: "pending" }` before the source emits.
3. `fetchMainPage({ page: 0 })` resolves → `{ posts: [{ id: "1", isPost: true }, { id: "2", isPost: true }] }`.
4. For each field in `pageState.fields`:
   - `posts` is `kind: "array"`, model: `postModel`
   - Calls `postModel.getKey` on each item → keys `["1", "2"]`
   - Calls `postModelStore.setMany([post1, post2])` → each key's `Atom` updated
5. Builds projection:
   ```ts
   combineLatest(["1", "2"].map(k => postModelStore.get(k)))
     .pipe(map(posts => ({ posts })))
   ```
6. `combineLatest` emits immediately (atoms have current values) → `Pending` transitions to `fulfilled`.

### Ongoing reactivity

If any other component or fetch calls `postModelStore.set("1", updatedPost)`:
- The `Atom` at key `"1"` emits the new value
- `combineLatest` re-emits with the updated post
- `<Pending>` re-renders — no re-fetch needed

### Params change

`setParams({ page: 1 })`:
1. `useStateData` returns a new Observable instance (new memo)
2. `usePending` sees a new `source$` → re-subscribes → shows pending
3. Old projection torn down; atoms for old keys remain in the model store, still serve other subscribers
4. New fetch → new keys → new projection

### Error handling

If `fetchMainPage` rejects:
- Observable errors → `usePending` catches → `status: "rejected"` with `onReload` callback
- Model stores are not modified
- `onReload` re-subscribes to the same observable → retries the fetch

---

## 4. React API

### useStateData

```ts
function useStateData<TParams, TShape>(
  state: StateDescriptor<TParams, TShape>,
  fetchFn: (params: TParams) => Promise<TShape>,
  params: TParams,
): Observable<TShape>
```

Internals:
- Calls `useModelRegistry()` — reads `IModelRegistry` from `ModelRegistryContext`
- Returns `useMemo(() => new Observable(...), [state, fetchFn, params, registry])`
- On subscription: triggers fetch, normalizes into model stores via `setMany`/`set`, then subscribes to the `combineLatest` projection
- `params` comparison is by reference — caller should stabilize with `useState` or `useMemo`

### Pending component (copied from common repo)

```ts
type IPendingProps<T> = {
  value$: Observable<T> | T;
  pending?: ReactNode | (() => ReactNode);
  rejected?: (status: { status: 'rejected'; error: unknown; onReload: () => void }) => ReactNode;
  children: (data: T) => ReactNode;
  getDefaultValue?: () => T;
};

function Pending<T>(props: IPendingProps<T>): ReactElement
```

`ObservableLike<T>` (`Observable<T> | T`) and `toObservable` are inlined — no dependency on the common package.

### Full usage example

```tsx
// Define models (module level, rxfy)
const postModel = createModel(
  z.object({ id: z.string(), isPost: z.literal(true) }),
  { getKey: (x) => x.id },
);
const userModel = createModel(
  z.object({ id: z.string(), name: z.string() }),
  { getKey: (x) => x.id },
);

// Define state (module level, rxfy)
const pageState = defineState({
  params: z.object({ page: z.number() }),
  model: { posts: array(postModel) },
});

// Register models in provider (app setup, rxfy-react)
const { StoreProvider, useStore } = createStoreFactory({
  getInitial: (registry) => ({
    posts: registry.model(postModel),
    users: registry.model(userModel),
  }),
});

// Fetch function (app code)
async function fetchMainPage({ page }: { page: number }) {
  const res = await api.get(`/posts?page=${page}`);
  return { posts: res.posts };  // must match TShape of pageState
}

// Component (app code)
function MainPage() {
  const [params, setParams] = useState({ page: 0 });
  const state$ = useStateData(pageState, fetchMainPage, params);

  return (
    <Pending value$={state$} pending={<Spinner />}>
      {(data) => (
        <div>
          {data.posts.map(x => <div key={x.id}>Post</div>)}
        </div>
      )}
    </Pending>
  );
}
```

---

## 5. withData.tsx — Complete Rewrite

No dependency on `IStore`, `createStore`, `createAtom`, or any other `store.ts` export.

```ts
// ModelRegistryContext — standalone, exported so useStateData can consume it
export const ModelRegistryContext = createContext<IModelRegistry | null>(null);

export function useModelRegistry(): IModelRegistry {
  const ctx = useContext(ModelRegistryContext);
  if (!ctx) throw new Error("StoreProvider is not found");
  return ctx;
}

export type IStoreConfig<TInterface> = {
  getInitial: (registry: IModelRegistry) => TInterface;
};

export type IStoreProviderProps<TInterface> = PropsWithChildren & {
  store?: TInterface;  // pass pre-built store for testing / external control
};

export function createStoreFactory<TInterface>(config: IStoreConfig<TInterface>) {
  const storeContext = createContext<{ store: TInterface } | null>(null);

  function StoreProvider({ children, store: externalStore }: IStoreProviderProps<TInterface>) {
    const [{ store: internalStore, registry }] = useState(() => {
      const reg = createModelRegistry();
      return { store: config.getInitial(reg), registry: reg };
    });

    return (
      <ModelRegistryContext.Provider value={registry}>
        <storeContext.Provider value={{ store: externalStore ?? internalStore }}>
          {children}
        </storeContext.Provider>
      </ModelRegistryContext.Provider>
    );
  }

  function useStore() {
    const ctx = useContext(storeContext);
    if (!ctx) throw new Error("StoreProvider is not found");
    return ctx.store;
  }

  return { StoreProvider, useStore };
}
```

`initialState` prop (previously used for SSR hydration) is removed — SSR is out of scope.

---

## 6. TypeScript Inference

End-to-end inference chain:

```
createModel(schema, { getKey })
  → ModelDescriptor<z.output<typeof schema>>

array(postModel)
  → FieldDescriptor<Array<z.output<typeof postModel.schema>>>

defineState({ params, model: { posts: array(postModel) } })
  → StateDescriptor<z.output<typeof params>, { posts: Post[] }>

useStateData(pageState, fetchFn, params)
  requires: fetchFn: (p: { page: number }) => Promise<{ posts: Post[] }>
  returns:  Observable<{ posts: Post[] }>

<Pending value$={state$}>
  {(data) => ...}   // data: { posts: Post[] }  ← full autocomplete
```

Wrong fetch return type → compile error at the `useStateData` call site.

---

## 7. What Is Not In Scope

- **SSR / snapshot support** — removed along with `ssr.ts`. Model stores are not serialized. Follow-up iteration.
- **Invalidation / force-refresh** — no manual refetch API beyond params change. Follow-up.
- **Pagination / cursor merging** — each params value is independent. Accumulating across pages not supported. Follow-up.
- **Batched loading** — `factoryBatch` from old `store.ts` has no equivalent. If needed, the fetch function can batch internally. Follow-up.
- **Nested registry scoping** — one flat registry per provider. Follow-up if sub-tree scoping is needed.
- **`store.ts` migration guide** — existing consumers of `IStore`/`factory`/`useEdge` are not migrated in this iteration. `useEdge` and `<Edge>` continue to work via `edge.ts`.
