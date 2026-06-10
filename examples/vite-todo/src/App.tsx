import { useMemo, useState } from "react";
import { Pending } from "rxfy-react";
import { useStateData } from "rxfy-react";
import type { Filter } from "./todos.ts";
import { createTodo, fetchTodos, todosState, toggleTodo, useTodoStore } from "./todos.ts";
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
  filter: Filter;
  version: number;
};

function TodoList({ filter, version }: TodoListProps) {
  const params = useMemo(() => ({ filter, version }), [filter, version]);
  const state$ = useStateData(todosState, fetchTodos, params);

  return (
    <Pending
      value$={state$}
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
            {todos.map((todo) => (
              <TodoItem key={todo.id} id={todo.id} />
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

const FILTERS: Filter[] = ["all", "active", "done"];

export default function App() {
  const [filter, setFilter] = useState<Filter>("all");
  const [version, setVersion] = useState(0);
  const store = useTodoStore();

  const handleAdd = (title: string) => {
    const todo = createTodo(title);
    // Put the new todo in the model store immediately,
    // then bump version to re-fetch so it appears in the list projection
    store.set(todo.id, todo);
    setVersion((v) => v + 1);
  };

  return (
    <div className="app">
      <h1>todos</h1>
      <AddTodo onAdd={handleAdd} />
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      <TodoList filter={filter} version={version} />
    </div>
  );
}
