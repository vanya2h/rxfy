import { useMemo, useState } from "react";
import { Pending, useModelStore, useObservable, useStateData } from "rxfy-react";
import { createTodo, fetchTodos, toggleTodo } from "../api-client.js";
import { todoModel, todosState } from "../todos.js";

function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  const todo$ = useMemo(() => store.get(id), [store, id]);
  return (
    <Pending value$={todo$}>
      {(todo) => (
        <li>
          <label>
            <input type="checkbox" checked={todo.done} onChange={() => void toggleTodo(todo.id, !todo.done)} />
            <span className={todo.done ? "done" : ""}>{todo.title}</span>
          </label>
        </li>
      )}
    </Pending>
  );
}

export function TodosPage() {
  const { data$, updatesAvailable$, applyUpdates } = useStateData({
    state: todosState,
    fetchFn: fetchTodos,
    params: {},
  });
  const updates = useObservable(updatesAvailable$, 0);
  const [title, setTitle] = useState("");

  return (
    <section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          setTitle("");
          void createTodo(next).then(() => applyUpdates());
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
        <button type="submit">Add</button>
      </form>
      {updates > 0 && (
        <button className="updates-badge" onClick={applyUpdates}>
          {updates} new — refresh
        </button>
      )}
      <Pending value$={data$} pending={<p>Loading…</p>} rejected={(w) => <p>Failed: {String(w.error)}</p>}>
        {({ todos }) => (
          <ul>
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )}
      </Pending>
    </section>
  );
}
