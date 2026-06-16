// @vitest-environment node
import { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { array, createModel, createModelRegistry, defineState } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Pending } from "../Pending.js";
import { StoreProvider } from "../StoreProvider.js";
import { useStateData } from "../useStateData.js";
import { collectStateData } from "./collect-state-data.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });
const todosState = defineState({ key: "todos", params: z.object({}), model: { todos: array(todoModel) } });

describe("collectStateData", () => {
  it("loops render passes until all fetches settle, returning fulfilled HTML", async () => {
    const registry = createModelRegistry();
    const fetchFn = vi.fn().mockResolvedValue({ todos: [{ id: "1", title: "A" }] });

    function App() {
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

    const html = await collectStateData(registry, () =>
      renderToString(
        <StoreProvider registry={registry} ssr>
          <Suspense fallback="loading">
            <App />
          </Suspense>
        </StoreProvider>,
      ),
    );

    expect(html).toContain("<li>1</li>");
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("returns immediately when nothing suspends", async () => {
    const registry = createModelRegistry();
    const render = vi.fn().mockReturnValue("<div>static</div>");
    const html = await collectStateData(registry, render);
    expect(html).toBe("<div>static</div>");
    expect(render).toHaveBeenCalledOnce();
  });

  it("rethrows render errors unrelated to suspension", async () => {
    const registry = createModelRegistry();
    await expect(
      collectStateData(registry, () => {
        throw new Error("render bug");
      }),
    ).rejects.toThrow("render bug");
  });
});
