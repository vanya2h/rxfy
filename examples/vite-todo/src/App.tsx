import { useEffect, useMemo, useState } from "react";
import { Pending, useStateData } from "rxfy-react";
import type { Observable } from "rxjs";
import type { Filter } from "./todos.ts";
import { createTodo, fetchTodos, FILTERS, parseFilter, todosState, toggleTodo, useTodoStore } from "./todos.ts";
import "./App.css";

// Subscribes to a single todo reactively — updates without re-fetching the list
function TodoItem({ id }: { id: string }) {
  const store = useTodoStore();
  const todo$ = useMemo(() => store.get(id), [store, id]);

  return (
    <Pending value$={todo$}>
      {(todo) => (
        <li className="todo-item">
          <input
            type="checkbox"
            checked={todo.done}
            onChange={() => {
              const updated = toggleTodo(todo.id);
              // Instantly propagates to all subscribers — no re-fetch needed
              store.set(todo.id, updated);
            }}
          />
          <span className={todo.done ? "done" : ""}>{todo.title}</span>
        </li>
      )}
    </Pending>
  );
}

type TodoListProps = {
  data$: Observable<{ todos: string[] }>;
};

function TodoList({ data$ }: TodoListProps) {
  return (
    <Pending
      value$={data$}
      pending={<p className="status">Loading…</p>}
      rejected={({ onReload }) => (
        <p className="status error">
          Failed to load. <button onClick={onReload}>Retry</button>
        </p>
      )}
    >
      {({ todos }) =>
        todos.length === 0 ? (
          <p className="status">No todos here.</p>
        ) : (
          <ul className="todo-list">
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )
      }
    </Pending>
  );
}

type AddTodoProps = {
  onAdd: (title: string) => void;
};

function AddTodo({ onAdd }: AddTodoProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  };

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" autoFocus />
      <button type="submit">Add</button>
    </form>
  );
}

type AppProps = {
  /** Derived from the URL's ?filter= — the server and client entries pass the same value. */
  initialFilter?: Filter;
};

export default function App({ initialFilter = "all" }: AppProps) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const params = useMemo(() => ({ filter }), [filter]);
  const { data$, mutations } = useStateData(todosState, fetchTodos, params);

  const handleAdd = (title: string) => {
    const todo = createTodo(title);
    // The mutation normalizes the entity into the model store — no manual store.set needed.
    // Newly added todos are active — don't add to "done" filtered view
    if (filter !== "done") {
      mutations.addTodo(todo);
    }
  };

  const selectFilter = (f: Filter) => {
    setFilter(f);
    // each tab change is a history entry, and reloading the address server-renders the same view
    const url = new URL(window.location.href);
    if (f === "all") url.searchParams.delete("filter");
    else url.searchParams.set("filter", f);
    window.history.pushState(null, "", url);
  };

  // back/forward navigation restores the filter the URL describes
  useEffect(() => {
    const onPopState = () => setFilter(parseFilter(new URLSearchParams(window.location.search).get("filter")));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="app">
      <h1>todos</h1>
      <AddTodo onAdd={handleAdd} />
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => selectFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <TodoList data$={data$} />
    </div>
  );
}
