# rxfy

Stream-based state management built on RxJS.

## Packages

| Package | Purpose |
|---|---|
| [`rxfy`](packages/rxfy) | Core library — Atom, Edge, Lens, Models/States API |
| [`rxfy-react`](packages/rxfy-react) | Official React bindings |

## Install

```bash
npm install rxfy rxfy-react
# peer deps: rxjs zod lodash react react-dom @types/react
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
          <ul>{todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
          <button onClick={() => mutations.addTodo({ id: crypto.randomUUID(), title: "New", done: false })}>
            Add
          </button>
        </>
      )}
    </Pending>
  );
}
```

## Links

- [rxfy — Core API reference](packages/rxfy/README.md)
- [rxfy-react — React bindings reference](packages/rxfy-react/README.md)
- [Example app (vite-todo)](examples/vite-todo)
