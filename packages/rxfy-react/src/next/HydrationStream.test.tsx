// @vitest-environment node
import { renderToString } from "react-dom/server";
import { createModel, createModelRegistry, type DehydratedState } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StoreProvider } from "../StoreProvider.js";
import { HydrationStream } from "./HydrationStream.js";
import { insertedCallbacks, resetInsertedCallbacks } from "./next-navigation.stub.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

function extractPayload(node: React.ReactNode): DehydratedState {
  const html = renderToString(<>{node}</>);
  const match = /__RXFY_SSR__\.push\((.*)\)<\/script>/.exec(html);
  expect(match).not.toBeNull();
  // the payload is raw JSON inside the script body (not HTML-escaped there)
  return JSON.parse(match![1]!) as DehydratedState;
}

describe("HydrationStream", () => {
  it("flushes new entries once and returns null when nothing changed", () => {
    resetInsertedCallbacks();
    const registry = createModelRegistry();

    renderToString(
      <StoreProvider registry={registry} ssr>
        <HydrationStream />
      </StoreProvider>,
    );
    expect(insertedCallbacks).toHaveLength(1);
    const flush = insertedCallbacks[0]!;

    // nothing in the registry yet → null
    expect(flush()).toBeNull();

    registry.model(todoModel).set("1", { id: "1", title: "A" });
    registry.queries.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });

    const first = extractPayload(flush());
    expect(first).toEqual({
      queries: { "todos:{}": { status: "fulfilled", value: { todos: ["1"] } } },
      models: { todo: { "1": { id: "1", title: "A" } } },
    });

    // same data → already flushed → null
    expect(flush()).toBeNull();

    // a later write flushes only the delta
    registry.model(todoModel).set("2", { id: "2", title: "B" });
    const second = extractPayload(flush());
    expect(second).toEqual({ queries: {}, models: { todo: { "2": { id: "2", title: "B" } } } });
  });

  it("escapes < in payloads", () => {
    resetInsertedCallbacks();
    const registry = createModelRegistry();
    renderToString(
      <StoreProvider registry={registry} ssr>
        <HydrationStream />
      </StoreProvider>,
    );
    registry.queries.set("k", { status: "fulfilled", value: "</script>" });
    const html = renderToString(<>{insertedCallbacks[0]!()}</>);
    expect(html).not.toContain("</script><script>");
    expect(html).toContain("\\u003c/script>");
  });
});
