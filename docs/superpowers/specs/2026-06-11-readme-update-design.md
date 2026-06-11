# README Update Design — 2026-06-11

## Goal

Rewrite the three public-facing README files (`README.md`, `packages/rxfy/README.md`, `packages/rxfy-react/README.md`) to accurately reflect the current API (v0.2.x). The existing docs are severely outdated: the core README references removed exports (`createState`, `createStore`), and the React README covers only `useEdge`/`Edge` while the package now exports a full Models/States layer.

## Decisions

- **Style**: Concept-first (Option A) — 1–2 sentence description → type signature → minimal example. No prose padding.
- **Root README role**: Monorepo landing page — overview, architecture table, "quick taste" snippet, links to package docs.
- **API layer ordering**: Models/States API first (recommended path), low-level primitives second (advanced use).

## File 1 — `README.md` (root)

### Sections

1. **Title + one-liner** — `rxfy — stream-based state management built on RxJS`
2. **Install** — `npm install rxfy rxfy-react`
3. **Architecture table** — Public packages only (Package | Purpose):
   - `rxfy` — Core library (Atom, Edge, Lens, Models/States)
   - `rxfy-react` — React bindings
4. **Quick taste** — 10-line snippet using `defineState` + `useStateData` showing the recommended flow
5. **Links** — `packages/rxfy` full API, `packages/rxfy-react` API, `examples/vite-todo`

---

## File 2 — `packages/rxfy/README.md`

### Sections

1. **Title + one-liner + pronunciation** — `rxfy (/ɑɹ ɪks faɪ/) — stream-based state management built on RxJS`
2. **Install** — npm/pnpm/yarn
3. **Peer dependencies** — `rxjs ^7`, `zod ^3`, `lodash ^4`

### High-level API (Models/States layer — recommended)

#### `defineState`
Defines a typed state shape with optional params, model fields, and mutations.

```ts
function defineState<TParams, TFields, TMutations>(def: {
  params: z.ZodType<TParams>;
  model: TFields;
  mutations?: TMutations;
}): StateDescriptor<TParams, ShapeFromFields<TFields>, TMutations>
```

Example: a `todosState` with a `filter` param, a `todos` array field, and an `addTodo` mutation.

#### `createModel`
Creates a typed model descriptor used to normalize and share data across state slices.

```ts
function createModel<T>(
  schema: z.ZodType<T>,
  opts: { getKey: (item: T) => string }
): ModelDescriptor<T>
```

#### `array` / `single`
Field descriptor helpers — declare whether a `defineState` model field holds an array or a single item.

```ts
function array<T>(model: ModelDescriptor<T>): FieldDescriptor<T[]>
function single<T>(model: ModelDescriptor<T>): FieldDescriptor<T>
```

#### `createModelRegistry` / `createModelStore`
Low-level normalized storage. In React apps these are wired automatically by `StoreProvider`; use directly for non-React or custom setups.

```ts
function createModelRegistry(): IModelRegistry
function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T>
```

### Primitive API (low-level building blocks)

#### `Atom` / `createAtom`
Reactive cell extending `Observable`. Synchronous `get/set/modify` on top of a `BehaviorSubject`.

```ts
function createAtom<T>(value: T): Atom<T>
// Atom<T> implements IAtom<T>: get(), set(val), modify(fn)
```

Example: `createAtom(0)` counter with `modify`.

#### `Lens` / `createLens` / `keyLens`
Focused view into an Atom. Reads and writes propagate bidirectionally; uses `lodash.isEqual` for change detection.

```ts
function createLens<S, T>(source$: IAtom<S>, lens: ILens<S, T>): Lens<S, T>
function keyLens<S, K extends keyof S>(key: K): ILens<S, S[K]>
```

Example: `keyLens("name")` on a user atom.

#### `Edge` / `createEdge`
Manages an async data load lifecycle. Queues the load via `p-queue`, tracks `IDLE → PENDING → FULFILLED | REJECTED` state in an Atom.

```ts
function createEdge<T>(
  state$: IAtom<IEdgeState<T>>,
  queue: PQueue,
  loader: () => Observable<T>
): IEdge<T>
// IEdge<T>: { subject$, toObservable(), next() }
```

Example: loading a user by ID with `.next()` for refresh.

#### `IWrapped` / `StatusEnum` / helpers
Discriminated union for async state. Used internally by Edge; available for custom async primitives.

| Helper | Returns |
|---|---|
| `createIdle()` | `{ type: "IDLE" }` |
| `createPending()` | `{ type: "PENDING" }` |
| `createFulfilled(value)` | `{ type: "FULFILLED", value }` |
| `createRejected(error)` | `{ type: "REJECTED", error }` |

### See also
- `rxfy-react` — React bindings
- `examples/vite-todo` — full working example

---

## File 3 — `packages/rxfy-react/README.md`

### Sections

1. **Title + one-liner** — `rxfy-react — official React bindings for rxfy`
2. **Install** — `npm install rxfy rxfy-react`
3. **Peer dependencies** — `react ^18 || ^19`, `rxfy`, `lodash ^4`

### Setup

#### `StoreProvider`
Must wrap the app (or subtree) to provide the model registry context. Uses `createModelRegistry` internally.

```tsx
function StoreProvider({ children }: PropsWithChildren): JSX.Element
```

### High-level hooks (recommended path)

#### `useStateData`
Fetches data, normalizes it into the model registry, and returns a `StateHandle` for reactive access, optimistic updates, and mutations.

```ts
function useStateData<TParams, TShape, TMutations>(
  state: StateDescriptor<TParams, TShape, TMutations>,
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>,
  params: TParams
): StateHandle<TShape, TMutations>

// StateHandle: { data$, set(valueOrUpdater), reload(), mutations }
```

Example: `useStateData(todosState, fetchTodos, { filter })` returning `{ data$, mutations }`.

#### `useModelStore`
Returns the `ModelStore` for a descriptor — lets a component subscribe to a single normalized item reactively.

```ts
function useModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T>
// ModelStore<T>: { get(key): Observable<T>, set(key, val), setMany(items) }
```

Example: `store.get(id)` passed to `<Pending>` for per-item live updates.

### Rendering helpers

#### `Pending`
Renders a pending/rejected/fulfilled UI from any `Observable` (or plain value). `rejected` receives `{ status, error, onReload }`.

```tsx
function Pending<T>(props: {
  value$: ObservableLike<T>;
  pending?: IRenderable<void>;
  rejected?: IRenderable<IPendingStatus<T, "rejected">>;
  children: IRenderable<T>;
  getDefaultValue?: () => T;
}): JSX.Element
```

Example: wrapping a `data$` Observable from `useStateData`.

#### `BehaviorSubjectRender`
Renders from a `BehaviorSubject`, subscribing after mount and re-rendering on each new value.

```tsx
function BehaviorSubjectRender<T>(props: {
  value$: BehaviorSubject<T>;
  children: IRenderable<T>;
}): JSX.Element
```

### Low-level hooks (advanced use)

#### `usePending`
Tracks any `ObservableLike<T>` and returns `IPendingStatus<T>` — the hook powering `<Pending>`.

```ts
function usePending<T>(
  source$: ObservableLike<T>,
  getDefaultValue?: () => T
): IPendingStatus<T>

// IPendingStatus<T>:
//   { status: "pending" }
//   { status: "rejected"; error: unknown; onReload: () => void }
//   { status: "fulfilled"; value: T }
```

#### `useEdge` + `Edge`
`IEdge`-based async loading. For new code, prefer `usePending` with `useStateData`.

```ts
function useEdge<T>(edge: IEdge<T>): IEdgeState<T>
```

```tsx
function Edge<T>(props: {
  edge: IEdge<T>;
  children: IRenderFn<T>;
  rejected?: IRenderFn<unknown>;
  pending?: React.ReactNode;
}): JSX.Element
```

#### `useObservable`
Low-level hook that subscribes to any `Observable<T>` via `useSyncExternalStore`.

```ts
function useObservable<T>(observable: Observable<T>, initialValue: T): T
function useObservable<T>(observable: Observable<T>): T | undefined
```

### Context / registry internals

#### `ModelRegistryContext` / `useModelRegistry`
The React context holding the `IModelRegistry`. Use directly only when building custom providers or bypassing `StoreProvider`.

```ts
const ModelRegistryContext: React.Context<IModelRegistry | null>
function useModelRegistry(): IModelRegistry  // throws if no StoreProvider above
```

### See also
- `rxfy` — core library
- `examples/vite-todo` — full working example
