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
  "@types/react": "^18.0.0 || ^19.0.0",
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
    <Pending value$={data$} pending={<p>Loading...</p>}>
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

> **Note:** `store.get(id)` returns an Observable that never emits until `set` or `setMany` is called for that key. It stays in pending state until data arrives — typically populated by a `useStateData` call that includes this model in its `model` field.

---

## Rendering helpers

### `Pending`

Subscribes to any `ObservableLike<T>` and renders the appropriate UI for pending, rejected, or fulfilled state. The `rejected` render prop receives `{ status, error, onReload }` for retry flows. If `rejected` is not provided, it defaults to rendering nothing and logging the error to `console.error`.

```tsx
import { Pending } from "rxfy-react";

<Pending
  value$={data$}
  pending={<p>Loading...</p>}
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

Renders from a `BehaviorSubject`. Captures the current value at mount via `getValue()` and re-renders on subsequent emissions. Emissions that occur between mount and the subscription setup may be missed — use `<Pending>` for live observable data.

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

**Type:**

```ts
type IPendingStatus<T> =
  | { status: "pending" }
  | { status: "rejected"; error: unknown; onReload: () => void }
  | { status: "fulfilled"; value: T }
```

> **Note:** When wrapping `data$` from `useStateData`, `onReload` re-subscribes to the observable but does **not** call `reload()` on the `StateHandle`. To re-trigger the underlying `fetchFn`, call `reload()` from `useStateData` instead.

### `useEdge` + `Edge`

`IEdge`-based async loading. For new code, prefer `usePending` with `useStateData`.

```tsx
import { useEdge, Edge } from "rxfy-react";

// Hook form — returns IEdgeState<T>
const state = useEdge(myEdge);

// Component form
<Edge
  edge={myEdge}
  pending={<span>Loading...</span>}
  rejected={(err) => <span>{String(err)}</span>}
>
  {(value) => <div>{JSON.stringify(value)}</div>}
</Edge>
```

**Signatures:**

```ts
function useEdge<T>(edge: IEdge<T>): IEdgeState<T>
// IEdgeState<T> = IWrapped<T> from rxfy — same IDLE/PENDING/FULFILLED/REJECTED union
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
