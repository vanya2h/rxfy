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
  "lodash": "^4.0.0",
  "next": ">=14"
}
```

`next` is **optional** — only needed for the `rxfy-react/next` subpath (Next.js App Router streaming).

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
function StoreProvider(props: PropsWithChildren<{
  ssr?: boolean;                    // enables server-side fetch-and-suspend in useStateData
  registry?: IModelRegistry;        // per-request registry created by server code (for dehydrate)
  dehydratedState?: DehydratedState; // snapshot for custom transports — usually unnecessary, see below
}>): JSX.Element
```

All three props exist for [SSR](#server-side-rendering); a plain client-only app uses none of them. On the client the provider automatically ingests `window.__RXFY_SSR__` chunks — both the snapshot injected by `hydrationScript` and the streamed pushes from `<HydrationStream />`, including chunks arriving after hydration starts. `dehydratedState` is only needed when the snapshot travels by some other channel (a framework loader, tests).

---

## High-level hooks

### `useStateData`

Fetches data, normalizes entities into model stores, and returns a `StateHandle`. **`data$` emits the normalized query shape — entity ids, not entities** (`array` fields → `string[]`, `single` fields → `string`). Render lists by id and read entity data through [`useModelStore`](#usemodelstore); that's the only place entity values live, so a stale read is impossible by construction.

`fetchFn` returns the full fetch shape (entities) and receives an `AbortSignal` that fires on cleanup. `mutations` and `set` also operate on full entities: rxfy denormalizes the current ids into the freshest store values, runs your reducer, and normalizes the result back — one call updates both membership and entity data.

```tsx
import { useMemo, useState } from "react";
import { useStateData, useModelStore, Pending } from "rxfy-react";
import { todosState, fetchTodos, TodoModel } from "./todos";

function TodoApp() {
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");
  const params = useMemo(() => ({ filter }), [filter]);

  const { data$, mutations, reload } = useStateData(todosState, fetchTodos, params);

  return (
    <Pending value$={data$} pending={<p>Loading...</p>}>
      {({ todos }) => (
        <>
          <ul>{todos.map((id) => <TodoItem key={id} id={id} />)}</ul>
          <button onClick={() => mutations.addTodo({ id: crypto.randomUUID(), title: "new", done: false })}>
            Add
          </button>
          <button onClick={reload}>Reload</button>
        </>
      )}
    </Pending>
  );
}

function TodoItem({ id }: { id: string }) {
  const store = useModelStore(TodoModel);
  const todo$ = useMemo(() => store.get(id), [store, id]);
  return <Pending value$={todo$}>{(todo) => <li>{todo.title}</li>}</Pending>;
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
//   data$: Observable<QueryShapeOf<TShape>>;  // ids only
//   set: (value: TShape | ((prev: TShape) => TShape)) => void;  // full entities
//   reload: () => void;
//   mutations: BoundMutations<TShape, TMutations>;  // full entities
// }
```

**Caching semantics** (states with a `key`): results, mutations, and `set` write through to the registry's query cache, so a remount with the same params starts from the cached ids without re-fetching — while entity values always come live from model stores (a websocket-style `store.set` between mounts is never clobbered). `reload()` deletes the cache entry and re-fetches. Keyless states skip the cache entirely and fetch per mount.

**During SSR** (inside `<StoreProvider ssr>` on the server): a cache miss calls `fetchFn` and suspends until it settles; concurrent components with the same key share one fetch. Rejections are captured and hydrate as rejected state — `<Pending rejected>` renders them with a working retry. See [Server-side rendering](#server-side-rendering).

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
// ModelStore<T>: {
//   get(key: string): Observable<T>;
//   set(key, val): void;
//   setMany(items): void;
//   getValue(key: string): T | undefined;  // synchronous read
//   valueEntries(): [string, T][];
// }
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

> **Note:** When wrapping `data$` from `useStateData`, `onReload` calls the handle's `reload()` (rxfy attaches it to the observable) — it invalidates the query cache entry and re-fetches. For other observables, `onReload` falls back to re-subscribing the source.
>
> **Contract:** `source$` must be referentially stable across renders (memoize it — `data$` from `useStateData` already is). A new identity restarts the pipeline from `"pending"`; an observable created inline in render restarts every render and never settles.

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

Emissions that are deep-equal (`lodash.isEqual`) to the current value are skipped — re-emitting an identical value does not re-render.

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

## Server-side rendering

SSR is on-demand: there is no prefetch API. Components declare their data with `useStateData` exactly as on the client; on the server (`<StoreProvider ssr>`) a cache miss suspends until the fetch settles. Results — fulfilled or rejected — are captured in the registry, serialized into the HTML, and ingested on the client so the first paint is already fulfilled: no loading flash, no re-fetch, no hydration mismatch.

Requirements: give models a `name` and states a `key` (stable string identities), and write `fetchFn` to work in both environments (it runs on the server during SSR and on the client for reloads).

### Buffered mode (any Node server)

Wait for every Suspense boundary with `onAllReady`, then send the complete document. This is the recommended non-Next mode — [examples/vite-todo](../../examples/vite-todo) runs it end to end.

```tsx
// server
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";

function render(): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry(); // one per request
  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StoreProvider registry={registry} ssr><App /></StoreProvider>,
      {
        onAllReady() {
          // collect the stream into a string, then:
          // resolve({ html, state: hydrationScript(dehydrate(registry)) });
        },
        onError: reject,
      },
    );
  });
}

// template: <div id="root"><!--app-html--></div><!--app-state-->
// inject:   template.replace("<!--app-state-->", state)
```

```tsx
// client — StoreProvider picks the snapshot up from the injected script automatically
import { hydrateRoot } from "react-dom/client";

hydrateRoot(
  document.getElementById("root")!,
  <StoreProvider ssr><App /></StoreProvider>,
);
```

### Streaming mode (Next.js App Router)

`rxfy-react/next` ships `<HydrationStream />`: on each stream flush it emits newly settled queries and newly written entities as `window.__RXFY_SSR__.push(...)` script tags; the client `StoreProvider` ingests them — including chunks arriving after hydration starts.

```tsx
// app/providers.tsx
"use client";
import { StoreProvider } from "rxfy-react";
import { HydrationStream } from "rxfy-react/next";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider ssr>
      <HydrationStream />
      {children}
    </StoreProvider>
  );
}
```

`next` is an optional peer dependency — only this subpath needs it.

### Two-pass mode (strict `renderToString`)

For environments without React stream APIs, `collectStateData` loops render passes until nothing suspends (the `getDataFromTree` pattern; each fetch waterfall level costs one extra pass):

```ts
import { renderToString } from "react-dom/server";
import { collectStateData } from "rxfy-react";

const html = await collectStateData(registry, () =>
  renderToString(<StoreProvider registry={registry} ssr><App /></StoreProvider>),
);
const state = hydrationScript(dehydrate(registry));
```

**Signature:**

```ts
function collectStateData(registry: IModelRegistry, render: () => string): Promise<string>
```

### Error handling

A `fetchFn` rejection on the server is captured as a serialized rejected entry (`{ name, message }`, stack stripped) and hydrates as rejected state — the server HTML shows your `<Pending rejected>` UI, and its `onReload` retries client-side with a real fetch.

---

## See also

- [rxfy — Core API](../rxfy/README.md)
- [examples/vite-todo](../../examples/vite-todo) — full working example with buffered SSR and URL-driven state
