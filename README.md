# rxfy

rxfy lets you declare typed models and the states that query them, then access their data as reactive observables. Normalization keeps your app consistent and reactive at no extra cost. Built on RxJS.

## Packages

| Package | Purpose |
|---|---|
| [`rxfy`](packages/rxfy) | Core library — Atom, Edge, Lens, Models/States API, SSR dehydrate/hydrate |
| [`rxfy-react`](packages/rxfy-react) | Official React bindings (`rxfy-react/next` for Next.js App Router) |

## Install

```bash
npm install rxfy rxfy-react
# peer deps: rxjs zod lodash react react-dom @types/react
```

## Quick taste

You define models with `createModel` and the states that fetch them with `defineState`; rxfy splits each result into normalized model stores plus an id-only query shape. Every entity lives in exactly one place, keyed by id, and components subscribe to it directly — so a single `store.set` (a refetch, a mutation, or a websocket push) reaches every view showing that entity, with no duplicated data and no list re-fetch. RxJS streams are the delivery mechanism; SSR snapshots the same store and rehydrates it with zero client fetches.

```tsx
import { useMemo } from "react";
import { z } from "zod";
import { createModel, defineState, array } from "rxfy";
import { StoreProvider, useStateData, useModelStore, Pending } from "rxfy-react";

const Todo = createModel(
  z.object({ id: z.string(), title: z.string(), done: z.boolean() }),
  { getKey: (t) => t.id, name: "todo" }, // name: stable identity for SSR serialization
);

const todosState = defineState({
  key: "todos", // key: stable identity for the SSR query cache
  params: z.object({ filter: z.enum(["all", "active", "done"]) }),
  model: { todos: array(Todo) },
  mutations: {
    // reducers see full entities — rxfy normalizes the result back into stores + ids
    addTodo: (prev, todo: { id: string; title: string; done: boolean }) => ({
      ...prev,
      todos: [...prev.todos, todo],
    }),
  },
});

// fetchTodos: (params: { filter: string }, signal: AbortSignal) => Promise<{ todos: Todo[] }>

function App() {
  return (
    <StoreProvider>
      <TodoApp />
    </StoreProvider>
  );
}

function TodoApp() {
  const { data$, mutations } = useStateData(todosState, fetchTodos, { filter: "all" });
  return (
    <Pending value$={data$} pending={<p>Loading...</p>}>
      {({ todos }) => (
        <>
          <ul>{todos.map((id) => <TodoItem key={id} id={id} />)}</ul>
          <button onClick={() => mutations.addTodo({ id: crypto.randomUUID(), title: "New", done: false })}>
            Add
          </button>
        </>
      )}
    </Pending>
  );
}

// subscribes to one entity — updates live on any store.set, no list re-fetch
function TodoItem({ id }: { id: string }) {
  const store = useModelStore(Todo);
  const todo$ = useMemo(() => store.get(id), [store, id]);
  return <Pending value$={todo$}>{(todo) => <li>{todo.title}</li>}</Pending>;
}
```

## SSR

The server fetches on demand via Suspense — no prefetch API. `useStateData` suspends on a cache miss, results are captured as fulfilled/rejected entries, `dehydrate` serializes them into the HTML, and the hydrated client renders the same markup on first paint with **zero client fetches**.

```tsx
// server (buffered mode)
const registry = createModelRegistry();
renderToPipeableStream(
  <StoreProvider registry={registry} ssr><App /></StoreProvider>,
  { onAllReady() { /* pipe html, then inject: */ hydrationScript(dehydrate(registry)) } },
);

// client — no wiring needed: StoreProvider ingests the injected script automatically
hydrateRoot(root, <StoreProvider ssr><App /></StoreProvider>);
```

Three supported modes: streaming (Next.js App Router via `rxfy-react/next`'s `<HydrationStream />`), buffered (`renderToPipeableStream` + `onAllReady`), and two-pass `renderToString` (`collectStateData`). See the [rxfy-react SSR docs](packages/rxfy-react/README.md#server-side-rendering).

## Links

- [rxfy — Core API reference](packages/rxfy/README.md)
- [rxfy-react — React bindings reference](packages/rxfy-react/README.md)
- [Example app with working SSR (vite-todo)](examples/vite-todo)
