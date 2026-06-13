import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createModel } from "../model/model.js";
import { createModelRegistry } from "../model/model-store.js";
import { StatusEnum } from "../wrapped/wrapped.js";
import { dehydrate, hydrate, hydrationScript } from "./hydration.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

describe("dehydrate", () => {
  it("serializes query entries and named model stores", () => {
    const registry = createModelRegistry();
    registry.model(todoModel).set("1", { id: "1", title: "A" });
    registry.queries.getQuery("todos:{}").set({ type: StatusEnum.FULFILLED, value: { todos: ["1"] } });

    expect(dehydrate(registry)).toEqual({
      queries: { "todos:{}": { type: StatusEnum.FULFILLED, value: { todos: ["1"] } } },
      models: { todo: { "1": { id: "1", title: "A" } } },
    });
  });

  it("is JSON round-trip safe", () => {
    const registry = createModelRegistry();
    registry.model(todoModel).set("1", { id: "1", title: "A" });
    registry.queries.getQuery("k").set({ type: StatusEnum.REJECTED, error: { name: "Error", message: "boom" } });
    const state = dehydrate(registry);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("warns once for an unnamed store holding data and skips it", () => {
    const unnamed = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });
    const registry = createModelRegistry();
    registry.model(unnamed).set("1", { id: "1" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = dehydrate(registry);
    expect(state.models).toEqual({});
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("dehydrate emits only terminal queries in SerializedWrapped form", () => {
    const registry = createModelRegistry();
    registry.queries.getQuery("posts:{}").set({ type: StatusEnum.FULFILLED, value: { posts: ["1"] } });
    registry.queries.getQuery("idle:{}"); // stays IDLE → excluded
    const snap = dehydrate(registry);
    expect(snap.queries).toEqual({ "posts:{}": { type: StatusEnum.FULFILLED, value: { posts: ["1"] } } });
  });
});

describe("hydrate", () => {
  it("restores queries and model stores into a fresh registry", () => {
    const source = createModelRegistry();
    source.model(todoModel).set("1", { id: "1", title: "A" });
    source.queries.getQuery("todos:{}").set({ type: StatusEnum.FULFILLED, value: { todos: ["1"] } });

    const target = createModelRegistry();
    hydrate(target, dehydrate(source));

    expect(target.queries.peek("todos:{}")).toEqual({ type: StatusEnum.FULFILLED, value: { todos: ["1"] } });
    // store not created yet — created on first model() call, seeded from stash
    expect(target.model(todoModel).getValue("1")).toEqual({ id: "1", title: "A" });
  });

  it("hydrate seeds query Atoms with FULFILLED ids", () => {
    const registry = createModelRegistry();
    hydrate(registry, {
      queries: { "posts:{}": { type: StatusEnum.FULFILLED, value: { posts: ["1"] } } },
      models: {},
    });
    expect(registry.queries.peek("posts:{}")).toEqual({ type: StatusEnum.FULFILLED, value: { posts: ["1"] } });
  });
});

describe("hydrationScript", () => {
  it("produces an inline script pushing the snapshot onto window.__RXFY_SSR__", () => {
    const registry = createModelRegistry();
    registry.model(todoModel).set("1", { id: "1", title: "</script>" });
    registry.queries.getQuery("todos:{}").set({ type: StatusEnum.FULFILLED, value: { todos: ["1"] } });

    const script = hydrationScript(dehydrate(registry));

    expect(script.startsWith("<script>(window.__RXFY_SSR__=window.__RXFY_SSR__||[]).push(")).toBe(true);
    expect(script.endsWith(")</script>")).toBe(true);
    // payload cannot break out of the script tag
    expect(script.slice("<script>".length, -"</script>".length)).not.toContain("</script>");

    // payload round-trips to the original snapshot
    const json = script.slice(script.indexOf(".push(") + ".push(".length, -")</script>".length);
    expect(JSON.parse(json)).toEqual(dehydrate(registry));
  });
});
