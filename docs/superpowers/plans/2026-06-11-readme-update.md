# README Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the three public-facing README files to accurately reflect rxfy v0.2.x — replacing stale content that references removed exports and missing the entire Models/States API layer.

**Architecture:** Three independent file rewrites: root `README.md` as monorepo landing page, `packages/rxfy/README.md` as comprehensive core API reference (Models/States first, then primitives), and `packages/rxfy-react/README.md` as React bindings reference. Each file is written whole and committed independently.

**Tech Stack:** Markdown only. No build step. Verify accuracy by diffing against `packages/rxfy/src/index.ts` and `packages/rxfy-react/src/index.tsx`.

---

### Task 1: Root `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Overwrite `README.md` with the following content**

```markdown
# rxfy

Stream-based state management built on RxJS.

## Packages

| Package | Purpose |
|---|---|
| [`rxfy`](packages/rxfy) | Core library — Atom, Edge, Lens, Models/States API |
| [`rxfy-react`](packages/rxfy-react) | Official React bindings |

## Install

```bash
npm install rxfy        # core only
npm install rxfy-react  # React bindings (peer-depends on rxfy)
```

## Quick taste

```ts
import { z } from "zod";
import { createModel, defineState, array } from "rxfy";
import { StoreProvider, useStateData, Pending } from "rxfy-react";

const Todo = createModel(
  z.object({ id: z.string(), title: z.string(), done: z.boolean() }),
  { getKey: (t) => t.id },
);

const todosState = defineState({
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(Todo) },
  mutations: {
    addTodo: (prev, todo: { id: string; title: string; done: boolean }) => ({
      ...prev,
      todos: [...prev.todos, todo],
    }),
  },
});

// Wrap your app once:
// <StoreProvider><App /></StoreProvider>

function TodoApp() {
  const { data$, mutations } = useStateData(todosState, fetchTodos, { filter: "all" });
  return (
    <Pending value$={data$} pending={<p>Loading…</p>}>
      {({ todos }) => <ul>{todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>}
    </Pending>
  );
}
```

## Documentation

- [rxfy — Core API reference](packages/rxfy/README.md)
- [rxfy-react — React bindings reference](packages/rxfy-react/README.md)
- [Example app (vite-todo)](examples/vite-todo)
```

- [ ] **Step 2: Verify the file looks right**

Open `README.md` and confirm:
- Architecture table lists only `rxfy` and `rxfy-react` (no internal packages)
- Quick taste imports are real exports — cross-check against `packages/rxfy/src/index.ts` and `packages/rxfy-react/src/index.tsx`
- No broken markdown (headers, code fences balanced)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite root README as monorepo landing page"
```

---

### Task 2: `packages/rxfy/README.md`

**Files:**
- Modify: `packages/rxfy/README.md`

- [ ] **Step 1: Overwrite `packages/rxfy/README.md` with the following content**

```markdown
# rxfy

rxfy (/ɑɹ ɪks faɪ/) — stream-based state management built on RxJS.

## Install

```bash
npm install rxfy
# or: pnpm add rxfy  /  yarn add rxfy
```

## Peer dependencies

```json
{
  "rxjs": "^7.0.0",
  "zod": "^3.0.0",
  "lodash": "^4.0.0"
}
```

---

## High-level API

The recommended approach — define typed state shapes, normalize entities, and mutate state without manual bookkeeping.

### `defineState`

Defines a typed state shape: fetch params schema, model fields, and optional mutations.

```ts
import { z } from "zod";
import { defineState, array } from "rxfy";

const todosState = defineState({
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(TodoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
  },
});
```

**Signature:**

```ts
function defineState<TParams, TFields, TMutations>(def: {
  params: z.ZodType<TParams>;
  model: TFields;
  mutations?: TMutations;
}): StateDescriptor<TParams, ShapeFromFields<TFields>, TMutations>
```

### `createModel`

Creates a typed model descriptor for normalizing and sharing entities across state slices.

```ts
import { z } from "zod";
import { createModel } from "rxfy";

const TodoModel = createModel(
  z.object({ id: z.string(), title: z.string(), done: z.boolean() }),
  { getKey: (todo) => todo.id },
);
```

**Signature:**

```ts
function createModel<T>(
  schema: z.ZodType<T>,
  opts: { getKey: (item: T) => string },
): ModelDescriptor<T>
```

### `array` / `single`

Field descriptor helpers — declare whether a `defineState` model field holds an array or a single item.

```ts
import { array, single } from "rxfy";

const userPageState = defineState({
  params: z.object({ userId: z.string() }),
  model: {
    user: single(UserModel),    // one item
    friends: array(UserModel),  // array of items
  },
});
```

**Signatures:**

```ts
function array<T>(model: ModelDescriptor<T>): FieldDescriptor<T[]>
function single<T>(model: ModelDescriptor<T>): FieldDescriptor<T>
```

### `createModelRegistry` / `createModelStore`

Low-level normalized storage. In React apps these are wired automatically by `StoreProvider` from `rxfy-react`; use directly for non-React or custom setups.

```ts
import { z } from "zod";
import { createModel, createModelRegistry } from "rxfy";

const UserModel = createModel(
  z.object({ id: z.string(), name: z.string() }),
  { getKey: (u) => u.id },
);

const registry = createModelRegistry();
const users = registry.model(UserModel);

users.set("1", { id: "1", name: "Alice" });
users.get("1").subscribe(console.log); // { id: "1", name: "Alice" }
```

**Signatures:**

```ts
function createModelRegistry(): IModelRegistry
// IModelRegistry: { model<T>(descriptor: ModelDescriptor<T>): ModelStore<T> }

function createModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T>
// ModelStore<T>: { get(key: string): Observable<T>; set(key, val): void; setMany(items): void }
```

---

## Primitive API

Lower-level building blocks. Use these for custom reactive patterns or when the high-level API doesn't fit.

### `Atom` / `createAtom`

A reactive cell — extends `Observable<T>` with synchronous `get()`, `set()`, and `modify()` backed by a `BehaviorSubject`.

```ts
import { createAtom } from "rxfy";

const count = createAtom(0);

count.get();               // 0
count.set(5);
count.modify((n) => n + 1);
count.get();               // 6

count.subscribe((n) => console.log(n)); // emits current value then future changes
```

**Signature:**

```ts
function createAtom<T>(value: T): Atom<T>
// Atom<T>: Observable<T> & { get(): T; set(val: T): void; modify(fn: (val: T) => T): void }
```

### `Lens` / `createLens` / `keyLens`

A focused, bidirectional view into an `Atom`. Reads and writes propagate in both directions. Uses `lodash.isEqual` for change detection.

```ts
import { createAtom, createLens, keyLens } from "rxfy";

const user = createAtom({ id: "1", name: "Alice" });
const name = createLens(user, keyLens("name"));

name.get();        // "Alice"
name.set("Bob");
user.get();        // { id: "1", name: "Bob" }
```

**Signatures:**

```ts
function createLens<S, T>(source$: IAtom<S>, lens: ILens<S, T>): Lens<S, T>

function keyLens<S, K extends keyof S>(key: K): ILens<S, S[K]>
// ILens<S, T>: { get(source: S): T; set(current: T, source: S): S }
```

### `Edge` / `createEdge`

Manages an async data load lifecycle. Queues the load via `p-queue`, tracking `IDLE → PENDING → FULFILLED | REJECTED` state in an `Atom`.

```ts
import PQueue from "p-queue";
import { of } from "rxjs";
import { createAtom, createEdge, createIdle } from "rxfy";

const queue = new PQueue({ concurrency: 5 });
const state$ = createAtom(createIdle<{ id: string }>());
const edge = createEdge(state$, queue, () => of({ id: "42" }));

edge.toObservable().subscribe((user) => console.log(user));
await edge.next(); // trigger a reload
```

**Signature:**

```ts
function createEdge<T>(
  state$: IAtom<IEdgeState<T>>,
  queue: PQueue,
  loader: () => Observable<T>,
): IEdge<T>

// IEdge<T>: {
//   subject$: IAtom<IEdgeState<T>>;
//   toObservable(): Observable<T>;
//   next(): Promise<IWrapped<T, StatusEnum.FULFILLED | StatusEnum.REJECTED>>;
// }
```

### `IWrapped` / `StatusEnum` / helpers

Discriminated union for async state. Used internally by `Edge`; available for custom async primitives.

```ts
import { createIdle, createPending, createFulfilled, createRejected } from "rxfy";

createIdle<string>();     // { type: "IDLE" }
createPending<string>();  // { type: "PENDING" }
createFulfilled("hi");    // { type: "FULFILLED", value: "hi" }
createRejected("oops");   // { type: "REJECTED", error: "oops" }
```

| Helper | Returns |
|---|---|
| `createIdle<T>()` | `{ type: "IDLE" }` |
| `createPending<T>()` | `{ type: "PENDING" }` |
| `createFulfilled<T>(value)` | `{ type: "FULFILLED", value }` |
| `createRejected<T>(error)` | `{ type: "REJECTED", error }` |

---

## See also

- [rxfy-react](../rxfy-react/README.md) — React bindings
- [examples/vite-todo](../../examples/vite-todo) — full working example
```

- [ ] **Step 2: Verify exports match source**

Cross-check every named export used in examples against `packages/rxfy/src/index.ts`:
- `defineState` — exported from `./state/state.js` ✓
- `createModel`, `array`, `single` — exported from `./model/model.js` ✓
- `createModelRegistry`, `createModelStore` — exported from `./model/model-store.js` ✓
- `createAtom` — exported from `./atom/atom.js` ✓
- `createLens`, `keyLens` — exported from `./lens/lens.js` ✓
- `createEdge` — exported from `./edge/edge.js` ✓
- `createIdle`, `createPending`, `createFulfilled`, `createRejected` — exported from `./wrapped/wrapped.js` ✓

Run: `grep -n "export" packages/rxfy/src/index.ts` and confirm nothing is missing or renamed.

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy/README.md
git commit -m "docs: rewrite rxfy README with full API reference"
```

---

### Task 3: `packages/rxfy-react/README.md`

**Files:**
- Modify: `packages/rxfy-react/README.md`

- [ ] **Step 1: Overwrite `packages/rxfy-react/README.md` with the following content**

```markdown
# rxfy-react

`rxfy-react` — official React bindings for [`rxfy`](../rxfy/README.md).

## Install

```bash
npm install rxfy rxfy-react
# or: pnpm add rxfy rxfy-react
```

## Peer dependencies

```json
{
  "react": "^18.0.0 || ^19.0.0",
  "react-dom": "^18.0.0 || ^19.0.0",
  "rxfy": "*",
  "lodash": "^4.0.0"
}
```

---

## Setup

Wrap your app (or the relevant subtree) with `StoreProvider`. This creates the model registry that `useStateData` and `useModelStore` write to and read from.

```tsx
import { StoreProvider } from "rxfy-react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
);
```

**Signature:**

```ts
function StoreProvider({ children }: PropsWithChildren): JSX.Element
```

---

## High-level hooks

### `useStateData`

Fetches data, normalizes model fields into the registry, and returns a `StateHandle` with a reactive `data$` observable, `set`, `reload`, and bound `mutations`. Re-fetches when `params` changes. The `fetchFn` receives an `AbortSignal` that fires on cleanup or reload.

```tsx
import { useMemo, useState } from "react";
import { useStateData, Pending } from "rxfy-react";
import { todosState, fetchTodos } from "./todos";

function TodoApp() {
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const params = useMemo(() => ({ filter }), [filter]);

  const { data$, mutations, reload } = useStateData(todosState, fetchTodos, params);

  return (
    <Pending value$={data$} pending={<p>Loading…</p>}>
      {({ todos }) => (
        <>
          <ul>{todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
          <button onClick={() => mutations.addTodo({ id: crypto.randomUUID(), title: "new", done: false })}>
            Add
          </button>
          <button onClick={reload}>Reload</button>
        </>
      )}
    </Pending>
  );
}
```

**Signature:**

```ts
function useStateData<TParams, TShape, TMutations>(
  state: StateDescriptor<TParams, TShape, TMutations>,
  fetchFn: (params: TParams, signal: AbortSignal) => Promise<TShape>,
  params: TParams,
): StateHandle<TShape, TMutations>

// StateHandle<TShape, TMutations>: {
//   data$: Observable<TShape>;
//   set: (value: TShape | ((prev: TShape) => TShape)) => void;
//   reload: () => void;
//   mutations: BoundMutations<TShape, TMutations>;
// }
```

### `useModelStore`

Returns the `ModelStore` for a model descriptor. Lets a component subscribe to a single normalized entity that was populated by `useStateData` or a direct `store.set` call — without re-fetching the full list.

```tsx
import { useMemo } from "react";
import { useModelStore, Pending } from "rxfy-react";
import { TodoModel } from "./models";

function TodoItem({ id }: { id: string }) {
  const store = useModelStore(TodoModel);
  const todo$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={todo$}>
      {(todo) => <li>{todo.title}</li>}
    </Pending>
  );
}
```

**Signature:**

```ts
function useModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T>
// ModelStore<T>: { get(key: string): Observable<T>; set(key, val): void; setMany(items): void }
```

---

## Rendering helpers

### `Pending`

Subscribes to any `ObservableLike<T>` and renders the appropriate UI for pending, rejected, or fulfilled state. The `rejected` render prop receives `{ status, error, onReload }` for retry flows.

```tsx
import { Pending } from "rxfy-react";

<Pending
  value$={data$}
  pending={<p>Loading…</p>}
  rejected={({ error, onReload }) => (
    <p>
      Error: {String(error)} <button onClick={onReload}>Retry</button>
    </p>
  )}
>
  {(value) => <div>{JSON.stringify(value)}</div>}
</Pending>
```

**Signature:**

```tsx
function Pending<T>(props: {
  value$: ObservableLike<T>;
  pending?: IRenderable<void>;
  rejected?: IRenderable<IPendingStatus<T, "rejected">>;
  children: IRenderable<T>;
  getDefaultValue?: () => T;
}): JSX.Element

// IRenderable<T> = React.ReactNode | ((data: T) => React.ReactNode)
// ObservableLike<T> = Observable<T> | T
```

### `BehaviorSubjectRender`

Renders from a `BehaviorSubject`, re-rendering on each new value after mount.

```tsx
import { BehaviorSubjectRender } from "rxfy-react";
import { BehaviorSubject } from "rxjs";

const count$ = new BehaviorSubject(0);

<BehaviorSubjectRender value$={count$}>
  {(n) => <span>{n}</span>}
</BehaviorSubjectRender>
```

**Signature:**

```tsx
function BehaviorSubjectRender<T>(props: {
  value$: BehaviorSubject<T>;
  children: IRenderable<T>;
}): JSX.Element
```

---

## Low-level hooks

### `usePending`

Tracks any `ObservableLike<T>` and returns `IPendingStatus<T>`. This is the hook powering `<Pending>`.

```ts
import { usePending } from "rxfy-react";

const status = usePending(data$);
// { status: "pending" }
// { status: "rejected"; error: unknown; onReload: () => void }
// { status: "fulfilled"; value: T }
```

**Signature:**

```ts
function usePending<T>(
  source$: ObservableLike<T>,
  getDefaultValue?: () => T,
): IPendingStatus<T>
```

### `useEdge` + `Edge`

`IEdge`-based async loading. For new code, prefer `usePending` with `useStateData`.

```tsx
import { useEdge, Edge } from "rxfy-react";

// Hook form — returns IEdgeState<T>
const state = useEdge(myEdge);

// Component form
<Edge
  edge={myEdge}
  pending={<span>Loading…</span>}
  rejected={(err) => <span>{String(err)}</span>}
>
  {(value) => <div>{JSON.stringify(value)}</div>}
</Edge>
```

**Signatures:**

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

// IRenderFn<T> = React.ReactNode | ((data: T) => React.ReactNode)
```

### `useObservable`

Low-level hook that subscribes to any `Observable<T>` via `useSyncExternalStore`.

```ts
import { useObservable } from "rxfy-react";

const value = useObservable(observable$, defaultValue);
const maybeValue = useObservable(observable$); // T | undefined
```

**Signature:**

```ts
function useObservable<T>(observable: Observable<T>, initialValue: T): T
function useObservable<T>(observable: Observable<T>): T | undefined
```

---

## Context / registry internals

`ModelRegistryContext` and `useModelRegistry` expose the underlying React context. Use them directly only when building a custom provider or accessing the registry outside `StoreProvider`.

```tsx
import { ModelRegistryContext, useModelRegistry } from "rxfy-react";
import { createModelRegistry } from "rxfy";

// custom provider
const registry = createModelRegistry();
<ModelRegistryContext.Provider value={registry}>
  <App />
</ModelRegistryContext.Provider>

// inside any child — throws if no provider is found above
const registry = useModelRegistry();
```

**Signatures:**

```ts
const ModelRegistryContext: React.Context<IModelRegistry | null>
function useModelRegistry(): IModelRegistry
```

---

## See also

- [rxfy — Core API](../rxfy/README.md)
- [examples/vite-todo](../../examples/vite-todo) — full working example
```

- [ ] **Step 2: Verify exports match source**

Cross-check every named export used in examples against `packages/rxfy-react/src/index.tsx`:
- `StoreProvider` — exported from `./StoreProvider.js` ✓
- `useStateData`, `StateHandle`, `BoundMutations` — exported from `./useStateData.js` ✓
- `useModelStore` — exported from `./useModelStore.js` ✓
- `Pending`, `BehaviorSubjectRender`, `IPendingProps`, `IBehaviorSubjectRenderProps` — exported from `./Pending.js` ✓
- `usePending`, `IPendingStatus`, `ObservableLike` — exported from `./usePending.js` ✓
- `useEdge`, `Edge`, `IRenderFn` — defined inline in `./index.tsx` ✓
- `useObservable` — exported from `./useObservable.js` ✓
- `ModelRegistryContext`, `useModelRegistry` — exported from `./registry-context.js` ✓

Run: `grep -n "^export" packages/rxfy-react/src/index.tsx` and confirm nothing is missing or renamed.

- [ ] **Step 3: Commit**

```bash
git add packages/rxfy-react/README.md
git commit -m "docs: rewrite rxfy-react README with full API reference"
```
