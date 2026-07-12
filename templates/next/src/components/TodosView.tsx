"use client";
import { useMemo, useState } from "react";
import { Pending, useAtom, useModelStore, useStateData } from "rxfy-react";
import { createTodo } from "../lib/actions";
import { fetchTodos, todoModel, todosState } from "../lib/todos";

// Subscribes to one entity by id — a store.set for this id re-renders only this item.
function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  const [todo] = useAtom(store.get(id));
  return (
    <li>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={todo.done}
          // optimistic client-only toggle — add a server action here to also persist the change
          onChange={() => store.set(todo.id, { ...todo, done: !todo.done })}
        />
        <span className={todo.done ? "line-through opacity-60" : ""}>{todo.title}</span>
      </label>
    </li>
  );
}

export function TodosView() {
  const params = useMemo(() => ({}), []);
  // The store is already seeded by <HydrateSnapshot> from the RSC prefetch, so there is no fetch on first paint.
  const { data$, mutations } = useStateData({ state: todosState, fetchFn: fetchTodos, params });
  const [title, setTitle] = useState("");

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">rxfy todos</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          setTitle("");
          // Persist through the server action, then fold the created entity into the reactive store.
          void createTodo(next)
            .then((todo) => mutations.addTodo(todo))
            .catch(() => setTitle(next)); // restore the input so a failed create isn't lost
        }}
      >
        <input
          className="flex-1 rounded border px-2 py-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
        />
        <button className="rounded border px-3 py-1" type="submit">
          Add
        </button>
      </form>
      <Pending value$={data$} pending={<p>Loading…</p>} rejected={(w) => <p>Failed: {String(w.error)}</p>}>
        {({ todos }) => (
          <ul className="flex flex-col gap-2">
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )}
      </Pending>
    </main>
  );
}
