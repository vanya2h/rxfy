import { StatusEnum } from "rxfy";
import { describe, expect, it } from "vitest";
import { prefetch } from "./ssr";
import { fetchTodos, todosState } from "./todos";

describe("prefetch (SSR round-trip)", () => {
  it("dehydrates the todos query as FULFILLED with entities in the model store", async () => {
    const snapshot = await prefetch(todosState, fetchTodos, {});

    // The query is keyed `${state.key}:${stableStringify(params)}` — here "todos:{}".
    const query = snapshot.queries["todos:{}"];
    expect(query).toBeDefined();
    expect(query.type).toBe(StatusEnum.FULFILLED);

    // The query holds ids, not entities...
    const value = (query as { type: StatusEnum.FULFILLED; value: { todos: string[] } }).value;
    expect(value.todos.length).toBeGreaterThan(0);

    // ...and the entities live in the model store keyed by the model name ("todo").
    expect(Object.keys(snapshot.models.todo ?? {}).length).toBeGreaterThan(0);
  });
});
