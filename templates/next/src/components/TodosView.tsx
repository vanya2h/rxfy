"use client";
import { useState } from "react";
import { asKey } from "rxfy";
import { Pending, useAtom, useModelStore, useStateData } from "rxfy-react";
import { type Todo, todoModel, todosState } from "../todos";

async function fetchTodos(): Promise<{ todos: Todo[] }> {
  const res = await fetch("/api/todos");
  if (!res.ok) throw new Error("Failed to load todos");
  // The payload also carries `$grant`; useStateData lifts it to (re)subscribe.
  return (await res.json()) as { todos: Todo[] };
}

// Subscribes to one entity by id — a store patch for this id re-renders only this item.
function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  const [todo] = useAtom(store.get(asKey(todoModel, id)));
  return (
    <li>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={todo.done}
          // Persist the toggle; sync.update broadcasts an entity patch, so other tabs update live.
          onChange={() =>
            void fetch(`/api/todos/${todo.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ done: !todo.done }),
            })
          }
        />
        <span className={todo.done ? "line-through opacity-60" : ""}>{todo.title}</span>
      </label>
    </li>
  );
}

export function TodosView({ defaultData }: { defaultData: { todos: Todo[] } }) {
  const [title, setTitle] = useState("");
  // defaultData carries the RSC-fetched todos plus `$grant`; useStateData seeds the store and lifts
  // the grant to subscribe — no fetch on first paint.
  const { data$, updatesAvailable$, applyUpdates } = useStateData({
    state: todosState,
    fetchFn: fetchTodos,
    params: {},
    defaultData,
  });

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">rxfy live todos</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = title.trim();
          if (!next) return;
          setTitle("");
          void fetch("/api/todos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: next }),
          })
            .then((res) => {
              if (!res.ok) throw new Error("create failed");
            })
            .then(() => applyUpdates())
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
      <Pending value$={updatesAvailable$}>
        {(n) =>
          n > 0 && (
            <button className="updates-badge rounded border px-3 py-1" onClick={applyUpdates}>
              {n} new — refresh
            </button>
          )
        }
      </Pending>
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
