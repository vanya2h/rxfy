import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createModel } from "../model/model.js";
import { createModelRegistry } from "../model/model-store.js";
import { dehydrate, hydrate } from "./hydration.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "todo" });

describe("dehydrate", () => {
  it("serializes query entries and named model stores", () => {
    const registry = createModelRegistry();
    registry.model(todoModel).set("1", { id: "1", title: "A" });
    registry.queries.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });

    expect(dehydrate(registry)).toEqual({
      queries: { "todos:{}": { status: "fulfilled", value: { todos: ["1"] } } },
      models: { todo: { "1": { id: "1", title: "A" } } },
    });
  });

  it("is JSON round-trip safe", () => {
    const registry = createModelRegistry();
    registry.model(todoModel).set("1", { id: "1", title: "A" });
    registry.queries.set("k", { status: "rejected", error: { name: "Error", message: "boom" } });
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
});

describe("hydrate", () => {
  it("restores queries and model stores into a fresh registry", () => {
    const source = createModelRegistry();
    source.model(todoModel).set("1", { id: "1", title: "A" });
    source.queries.set("todos:{}", { status: "fulfilled", value: { todos: ["1"] } });

    const target = createModelRegistry();
    hydrate(target, dehydrate(source));

    expect(target.queries.get("todos:{}")).toEqual({ status: "fulfilled", value: { todos: ["1"] } });
    // store not created yet — created on first model() call, seeded from stash
    expect(target.model(todoModel).getValue("1")).toEqual({ id: "1", title: "A" });
  });
});
