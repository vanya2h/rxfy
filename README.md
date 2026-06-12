# rxfy

Stream-based state management built on RxJS — normalized entities, reactive queries, and first-class SSR.

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

State is normalized: `data$` emits entity **ids**, and entity data lives in model stores. Components render lists by id and subscribe per entity — so a single `store.set` (e.g. from a websocket) updates every subscriber without re-fetching anything.

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
  { onAllReady() { /* pipe html, then inject: */ serializeForHtml(dehydrate(registry)) } },
);

// client
hydrateRoot(root, <StoreProvider ssr dehydratedState={window.__RXFY_STATE__}><App /></StoreProvider>);
```

Three supported modes: streaming (Next.js App Router via `rxfy-react/next`'s `<HydrationStream />`), buffered (`renderToPipeableStream` + `onAllReady`), and two-pass `renderToString` (`collectStateData`). See the [rxfy-react SSR docs](packages/rxfy-react/README.md#server-side-rendering).

## Links

- [rxfy — Core API reference](packages/rxfy/README.md)
- [rxfy-react — React bindings reference](packages/rxfy-react/README.md)
- [Example app with working SSR (vite-todo)](examples/vite-todo)
