import { act, renderHook } from "@testing-library/react";
import { array, createModel, createModelRegistry, defineState, type IModelRegistry } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStore } from "./useModelStore.js";
import { useStateData } from "./useStateData.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

type Todo = { id: string; title: string };

const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
  mutations: {
    addTodo: (prev, todo: Todo) => ({ ...prev, todos: [...prev.todos, todo] }),
  },
});

function makeWrapper(registry: IModelRegistry) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <StoreProvider registry={registry}>{children}</StoreProvider>;
  };
}

function seedFulfilled(registry: IModelRegistry) {
  registry.model(todoModel).set("1", { id: "1", title: "Hydrated" });
  registry.queries.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });
}

describe("useStateData cache integration", () => {
  it("cache hit: emits synchronously without calling fetchFn", () => {
    const registry = createModelRegistry();
    seedFulfilled(registry);
    const fetchFn = vi.fn();

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });

    let sync: unknown;
    result.current.data$.subscribe((v) => (sync = v)).unsubscribe();
    expect(sync).toEqual({ todos: ["1"] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("client fetch settle writes the result through to the cache", async () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockResolvedValue({ todos: [{ id: "9", title: "Fetched" }] });

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });
    await firstValueFrom(result.current.data$);

    expect(registry.queries.get("todos:{}")).toEqual({ status: "fulfilled", value: { todos: ["9"] } });
  });

  it("mutations write through to the cache (remounts see mutated data)", () => {
    const registry = createModelRegistry();
    seedFulfilled(registry);
    const fetchFn = vi.fn();

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });
    act(() => result.current.mutations.addTodo({ id: "2", title: "New" }));

    expect(registry.queries.get("todos:{}")).toEqual({ status: "fulfilled", value: { todos: ["1", "2"] } });
    expect(registry.model(todoModel).getValue("2")).toEqual({ id: "2", title: "New" });
  });

  it("remount on cache hit does not clobber fresher store values (normalize on write, never on read)", async () => {
    const registry = createModelRegistry();
    seedFulfilled(registry);
    const fetchFn = vi.fn();
    const wrapper = makeWrapper(registry);

    const first = renderHook(() => useStateData(todosState, fetchFn, {}), { wrapper });
    first.unmount();

    // websocket-style write between mounts
    registry.model(todoModel).set("1", { id: "1", title: "From socket" });

    const second = renderHook(
      () => ({ handle: useStateData(todosState, fetchFn, {}), store: useModelStore(todoModel) }),
      { wrapper },
    );
    const data = await firstValueFrom(second.result.current.handle.data$);
    expect(data).toEqual({ todos: ["1"] });
    expect(second.result.current.store.getValue("1")).toEqual({ id: "1", title: "From socket" });
  });

  it("reload() deletes the cache entry and re-fetches", async () => {
    const registry = createModelRegistry();
    seedFulfilled(registry);
    const fetchFn = vi.fn().mockResolvedValue({ todos: [{ id: "1", title: "Fresh" }] });

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });
    act(() => result.current.reload());

    const data = await firstValueFrom(result.current.data$);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(data).toEqual({ todos: ["1"] });
    expect(registry.model(todoModel).getValue("1")).toEqual({ id: "1", title: "Fresh" });
  });

  it("hydrated rejection: data$ errors synchronously with a rehydrated Error", () => {
    const registry = createModelRegistry();
    registry.queries.set("todos:{}", { status: "rejected", error: { name: "FetchError", message: "boom" } });
    const fetchFn = vi.fn();

    const { result } = renderHook(() => useStateData(todosState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });

    let caught: unknown;
    result.current.data$.subscribe({ error: (e) => (caught = e) }).unsubscribe();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe("FetchError");
    expect((caught as Error).message).toBe("boom");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("states without a key never touch the cache", async () => {
    const keylessState = defineState({ params: z.object({}), model: { todos: array(todoModel) } });
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockResolvedValue({ todos: [] });

    const { result } = renderHook(() => useStateData(keylessState, fetchFn, {}), {
      wrapper: makeWrapper(registry),
    });
    await firstValueFrom(result.current.data$);

    expect(registry.queries.entries()).toEqual([]);
  });
});
