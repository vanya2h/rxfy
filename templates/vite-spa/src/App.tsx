import { useMemo, useState } from "react";
import { asKey } from "rxfy";
import { Pending, useAtom, useModelStore, useStateData } from "rxfy-react";
import { fetchTodos, todoModel, todosState } from "./todos.ts";

// Subscribes to one entity by id — a store.set for this id re-renders only this item.
function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  const [todo] = useAtom(store.get(asKey(todoModel, id)));
  return (
    <li>
      <label>
        <input type="checkbox" checked={todo.done} onChange={() => store.set(todo.id, { ...todo, done: !todo.done })} />
        <span className={todo.done ? "done" : ""}>{todo.title}</span>
      </label>
    </li>
  );
}

export function App() {
  const params = useMemo(() => ({}), []);
  const { data$, mutations } = useStateData({ state: todosState, fetchFn: fetchTodos, params });
  const [title, setTitle] = useState("");

  return (
    <main>
      <h1>rxfy todos</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          setTitle("");
          // The mutation normalizes the entity into the store and appends its id to the list.
          mutations.addTodo({ id: crypto.randomUUID(), title: next, done: false });
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
        <button type="submit">Add</button>
      </form>
      <Pending value$={data$} pending={<p>Loading…</p>} rejected={(w) => <p>Failed: {String(w.error)}</p>}>
        {({ todos }) => (
          <ul>
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )}
      </Pending>
    </main>
  );
}
