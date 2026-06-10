# Models & States — Design Spec

**Date:** 2026-06-10  
**Status:** Approved

---

## Overview

Add a normalized state management layer to rxfy: **Models** are Zod-schema-backed reactive key-value stores that act as single source of truth for entities. **States** compose models into a typed shape driven by params. React components use `useStateData` + `<Pending>` to fetch, normalize, and reactively render state — with zero manual store wiring.

---

## 1. Core Primitives (packages/rxfy)

### ModelDescriptor\<T\>

Module-level, stateless. Created once and reused everywhere.

```ts
type ModelDescriptor<T> = {
  readonly _key: symbol;                   // unique lookup key in store registry
  readonly schema: z.ZodType<T>;
  readonly getKey: (item: T) => string;
};

function createModel<T>(
  schema: z.ZodType<T>,
  opts: { getKey: (item: T) => string },
): ModelDescriptor<T>
```

`_key` is a `Symbol()` created inside `createModel`. It is the identity of the model across all store instances — the store's model registry is a `Map<symbol, ModelStore<any>>`.

---

### Field helpers

Used inside `defineState` to describe the shape of a state field.

```ts
type FieldDescriptor<T> =
  | { kind: 'single'; model: ModelDescriptor<T> }
  | { kind: 'array';  model: ModelDescriptor<T> };   // T here is the element type

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

> **Note:** Named `defineState` (not `createState`) to avoid collision with the existing `createState` export from `store.ts`, which creates a branded `IStoreStateJS` wrapper used internally by `withData.tsx` and `ssr.ts`. The existing `createState` in `store.ts` will be renamed to `createStoreState` and its two call sites (`withData.tsx`, `ssr.ts`) updated accordingly.

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

`setMany` calls `atom.set(val)` per key. All observers of that key (from any state or component) receive the update immediately.

---

### Changes to IStore (packages/rxfy/src/store/store.ts)

Two new methods on `IStore`:

```ts
// Called during getInitial to register a model store
model: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>

// Called by useStateData to resolve a model store by descriptor
getModelStore: <T>(descriptor: ModelDescriptor<T>) => ModelStore<T>
```

`model()` creates a `ModelStore<T>`, registers it under `descriptor._key` in an internal `Map<symbol, ModelStore<any>>` on the store instance, and returns it. `getModelStore()` looks it up. Both are only meaningful on the root store — child nodes created via `node()` delegate to the root registry.

---

## 2. New File Layout

```
packages/rxfy/src/
  model/
    model.ts           ← createModel, array, single, ModelDescriptor, FieldDescriptor
    model-store.ts     ← ModelStore, createModelStore
  state/
    state.ts           ← defineState, StateDescriptor
  store/
    store.ts           ← (modified) add model() and getModelStore() to IStore
  index.ts             ← (modified) re-export new public types

packages/rxfy-react/src/
  useStateData.ts      ← main hook
  Pending.tsx          ← copied + adapted from common repo
  usePending.ts        ← copied + adapted from common repo
  useObservable.ts     ← copied + adapted from common repo
  render.ts            ← copied + adapted from common repo
  withData.tsx         ← (modified) extend context to include rawStore
  index.tsx            ← (modified) re-export new items
```

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
2. `<Pending value$={state$}>` subscribes — `usePending` prepends a `{ status: "pending" }` emission before the source emits.
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

If any other component or fetch updates `post:1` via `postModelStore.set("1", updated)`:
- The `Atom` at key `"1"` emits the new value
- `combineLatest` re-emits with updated post
- `<Pending>` re-renders with the new `state.value` — no re-fetch

### Params change

`setParams({ page: 1 })`:
1. `useStateData` returns a new Observable instance (new memo)
2. `usePending` sees a new `source$` → re-subscribes → shows pending
3. Old projection torn down; model store atoms for the old keys remain (still serve other subscribers)
4. New fetch → new keys → new projection

### Error handling

If `fetchMainPage` rejects:
- Observable errors → `usePending` catches it → `status: "rejected"` with `onReload` callback
- Model stores are not modified
- `onReload` re-subscribes to the same observable → retries the fetch

---

## 4. React API

### useStateData

```ts
// packages/rxfy-react/src/useStateData.ts
function useStateData<TParams, TShape>(
  state: StateDescriptor<TParams, TShape>,
  fetchFn: (params: TParams) => Promise<TShape>,
  params: TParams,
): Observable<TShape>
```

Internals:
- Calls `useRawStore()` (reads `rawStore` from extended context)
- Returns `useMemo(() => new Observable(...), [state, fetchFn, params, rawStore])`
- Observable subscription triggers fetch, normalizes into model stores, then subscribes to the `combineLatest` projection
- `params` comparison is by reference — caller should stabilize with `useState` or `useMemo`

### Pending component (copied from common repo)

```ts
// packages/rxfy-react/src/Pending.tsx
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

// Register models in store (app setup, rxfy-react)
const { StoreProvider, useStore } = createStoreFactory({
  getInitial: (store) => ({
    posts: store.model(postModel),
    users: store.model(userModel),
  }),
});

// Fetch function (app code)
async function fetchMainPage({ page }: { page: number }) {
  const res = await api.get(`/posts?page=${page}`);
  return { posts: res.posts };  // must match TShape of pageState
}

// Component (app code, rxfy-react)
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

## 5. withData.tsx Changes

Context type extended to carry `rawStore`:

```ts
type IStoreContextProps<TInterface> = {
  store: TInterface;
  rawStore: IStore<IStoreStateJS>;   // added
};
```

`StoreProvider` keeps the raw store reference separately from the interface store:

```ts
const [{ store: internalStore, rawStore }] = useState(() => {
  const queue = new PQueue({ concurrency: 5, autoStart: false });
  const state = initialState != null ? (initialState as IStoreStateJS) : createStoreState({});
  const raw = createStore(queue, createAtom(state));
  return { store: factoryConfig.getInitial(raw), rawStore: raw };
});
```

New exported hook:

```ts
function useRawStore(): IStore<IStoreStateJS>
```

Public `useStore()` is unchanged.

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

- **SSR / snapshot support for model stores** — the existing `IStore` snapshot mechanism serializes `Edge` state. Model stores use plain `Atom`s and are not currently included in the snapshot. This is a follow-up.
- **Invalidation / force-refresh** — no manual refetch API beyond params change. Follow-up.
- **Pagination / cursor merging** — each params value is independent. Accumulating results across pages is not supported. Follow-up.
- **Single-entity states** — `single(model)` helper is defined but the projection for a non-array field follows the same pattern. Included in scope but lower priority.
- **Nested node model registration** — `store.model()` is only valid on the root store passed to `getInitial`.
