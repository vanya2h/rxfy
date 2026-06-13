import { useMemo, useState } from "react";
import { Pending, useStateData } from "rxfy-react";
import { LiveProvider } from "./live/LiveProvider.tsx";
import {
  apiAddTodo,
  apiDeleteTodo,
  apiRenameTodo,
  apiToggleTodo,
  fetchTodos,
  todosState,
  useTodoStore,
} from "./models.ts";
import "./App.css";

// Subscribes to one todo's cell — re-renders when a push updates it, no list refetch.
function TodoItem({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
  const store = useTodoStore();
  const todo$ = useMemo(() => store.get(id), [store, id]);
  const [editing, setEditing] = useState(false);

  return (
    <Pending value$={todo$}>
      {(todo) => (
        <li className="todo-item">
          <input type="checkbox" checked={todo.done} onChange={() => apiToggleTodo(todo.id).catch(console.error)} />
          {editing ? (
            <input
              className="title-edit"
              autoFocus
              defaultValue={todo.title}
              onBlur={(e) => {
                setEditing(false);
                const next = e.target.value.trim();
                if (next && next !== todo.title) apiRenameTodo(todo.id, next).catch(console.error);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <span className={todo.done ? "done" : ""} onDoubleClick={() => setEditing(true)}>
              {todo.title}
            </span>
          )}
          <button className="remove" onClick={() => onRemove(todo.id)} aria-label="remove">
            ×
          </button>
        </li>
      )}
    </Pending>
  );
}

function TodoApp() {
  const params = useMemo(() => ({}), []);
  const { data$, mutations, reload } = useStateData(todosState, fetchTodos, params);

  // No live wiring here: LiveProvider subscribes to whatever lands in the store, so simply
  // fetching these todos makes them live (see live/useStoreSubscriptions.ts).

  const [title, setTitle] = useState("");

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setTitle("");
    const todo = await apiAddTodo(trimmed);
    mutations.addTodo(todo); // local list update; other tabs see it on reload
  };

  const handleRemove = async (id: string) => {
    await apiDeleteTodo(id);
    mutations.removeTodo(id);
  };

  // Wrappers so JSX event props get void-returning handlers (no-misused-promises).
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => void handleAdd(e).catch(console.error);
  const onRemove = (id: string) => void handleRemove(id).catch(console.error);

  return (
    <div className="app">
      <h1>realtime todos</h1>
      <p className="hint">Open this page in two tabs — toggling or renaming a todo updates both live.</p>
      <form className="add-form" onSubmit={onSubmit}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" />
        <button type="submit">Add</button>
        <button type="button" onClick={reload}>
          Reload
        </button>
      </form>
      <Pending
        value$={data$}
        pending={<p className="status">Loading…</p>}
        rejected={() => (
          <p className="status error">
            Failed to load. <button onClick={reload}>Retry</button>
          </p>
        )}
      >
        {({ todos }) =>
          todos.length === 0 ? (
            <p className="status">No todos yet.</p>
          ) : (
            <ul className="todo-list">
              {todos.map((id) => (
                <TodoItem key={id} id={id} onRemove={onRemove} />
              ))}
            </ul>
          )
        }
      </Pending>
    </div>
  );
}

export default function App() {
  return (
    <LiveProvider>
      <TodoApp />
    </LiveProvider>
  );
}
