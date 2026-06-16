// @vitest-environment node
import { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { array, createModel, createModelRegistry, defineState, type IModelRegistry, StatusEnum } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Pending } from "./Pending.js";
import { StoreProvider } from "./StoreProvider.js";
import { useStateData } from "./useStateData.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

const todosState = defineState({
  key: "todos",
  params: z.object({}),
  model: { todos: array(todoModel) },
});

type FetchFn = (params: object, signal: AbortSignal) => Promise<{ todos: { id: string; title: string }[] }>;

function TodoWidget({ fetchFn }: { fetchFn: FetchFn }) {
  const { data$ } = useStateData({ state: todosState, fetchFn, params: {} });
  return (
    <Pending value$={data$}>
      {({ todos }) => (
        <ul>
          {todos.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      )}
    </Pending>
  );
}

function renderApp(registry: IModelRegistry, fetchFn: FetchFn, widgets = 1) {
  return renderToString(
    <StoreProvider registry={registry} ssr>
      <Suspense fallback="loading">
        {Array.from({ length: widgets }, (_, i) => (
          <TodoWidget key={i} fetchFn={fetchFn} />
        ))}
      </Suspense>
    </StoreProvider>,
  );
}

describe("useStateData server suspend (ssr mode)", () => {
  it("cache miss: calls fetchFn, stores the in-flight promise, and suspends", () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockReturnValue(new Promise(() => {}));

    const html = renderApp(registry, fetchFn);

    expect(html).toContain("loading"); // renderToString renders the fallback for suspended boundaries
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(registry.queries.inflight()).toHaveLength(1);
  });

  it("dedup: two components with the same key cause one fetch", () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockReturnValue(new Promise(() => {}));

    renderApp(registry, fetchFn, 2);

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("after settle, re-render produces fulfilled HTML from the cache", async () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockResolvedValue({ todos: [{ id: "1", title: "A" }] });

    renderApp(registry, fetchFn); // first pass — suspends, promise stored
    await Promise.all(registry.queries.inflight());

    const html = renderApp(registry, fetchFn); // second pass — cache hit
    expect(html).toContain("<li>1</li>");
    expect(fetchFn).toHaveBeenCalledOnce();
    // entities normalized at settle — model store seeded
    expect(registry.model(todoModel).getValue("1")).toEqual({ id: "1", title: "A" });
  });

  it("fetch rejection is captured as a rejected query entry", async () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("backend down"));

    renderApp(registry, fetchFn);
    await Promise.all(registry.queries.inflight());

    const entry = registry.queries.peek("todos:{}");
    expect(entry?.type).toBe(StatusEnum.REJECTED);
    const error = entry?.type === StatusEnum.REJECTED ? entry.error : undefined;
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("backend down");
  });

  it("ssr=false: never suspends, never fetches on the server (backward compatible)", () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn();

    const html = renderToString(
      <StoreProvider registry={registry}>
        <TodoWidget fetchFn={fetchFn} />
      </StoreProvider>,
    );

    expect(fetchFn).not.toHaveBeenCalled();
    expect(html).toBe(""); // Pending renders the default null pending state
  });

  it("keyless state in ssr mode warns and does not suspend", () => {
    const keyless = defineState({ params: z.object({}), model: { todos: array(todoModel) } });
    function Widget() {
      const { data$ } = useStateData({ state: keyless, fetchFn: () => new Promise(() => {}), params: {} });
      return <Pending value$={data$}>{() => null}</Pending>;
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderToString(
      <StoreProvider registry={createModelRegistry()} ssr>
        <Widget />
      </StoreProvider>,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('without "key"'));
    warn.mockRestore();
  });
});
