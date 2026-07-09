import { useMemo, useState } from "react";
import { Pending, useModelStore, useStateData } from "rxfy-react";
import { useApi } from "../api-client.js";
import { todoModel, todosState } from "../todos.js";

function TodoItem({ id }: { id: string }) {
  const api = useApi();

  const store = useModelStore(todoModel);
  const todo$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={todo$}>
      {(todo) => (
        <li>
          <label>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() =>
                void api.todos[":id"].$patch({
                  param: { id: todo.id },
                  json: { done: !todo.done },
                })
              }
            />
            <span className={todo.done ? "done" : ""}>{todo.title}</span>
          </label>
        </li>
      )}
    </Pending>
  );
}

export function TodosPage() {
  const [title, setTitle] = useState("");

  const api = useApi();
  const { data$, updatesAvailable$, applyUpdates } = useStateData({
    state: todosState,
    fetchFn: async () => (await api.todos.$get()).json(),
    params: {},
  });

  return (
    <section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          setTitle("");
          void api.todos
            .$post({ json: { title: next } })
            .then(() => applyUpdates())
            .catch(() => setTitle(next)); // restore the input so a failed create isn't lost
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" />
        <button type="submit">Add</button>
      </form>
      <Pending value$={updatesAvailable$}>
        {(updates) =>
          updates > 0 && (
            <button className="updates-badge" onClick={applyUpdates}>
              {updates} new — refresh
            </button>
          )
        }
      </Pending>
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
