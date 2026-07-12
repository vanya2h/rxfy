import { renderHook } from "@testing-library/react";
import { createFulfilled, createModel, createModelRegistry, type DehydratedState, StatusEnum } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { useModelRegistry } from "./registry-context.js";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStore } from "./useModelStore.js";

const testModel = createModel({ schema: z.object({ id: z.string() }), getKey: (x) => x.id, name: "test" });

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("StoreProvider", () => {
  it("provides an isolated registry per mount", () => {
    const { result: a } = renderHook(() => useModelStore(testModel), { wrapper });
    const { result: b } = renderHook(() => useModelStore(testModel), { wrapper });
    expect(a.current).not.toBe(b.current);
  });
});

describe("useModelStore", () => {
  it("returns the same store instance on re-render", () => {
    const { result, rerender } = renderHook(() => useModelStore(testModel), { wrapper });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("auto-registers on first call", () => {
    const { result } = renderHook(() => useModelStore(testModel), { wrapper });
    expect(typeof result.current.get).toBe("function");
    expect(typeof result.current.set).toBe("function");
    expect(typeof result.current.setMany).toBe("function");
  });

  it("throws outside StoreProvider", () => {
    expect(() => renderHook(() => useModelStore(testModel))).toThrow("StoreProvider not found");
  });
});

const todoModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (x) => x.id,
  name: "todo",
});

describe("StoreProvider SSR props", () => {
  it("uses an externally provided registry", () => {
    const registry = createModelRegistry();
    const { result } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => <StoreProvider registry={registry}>{children}</StoreProvider>,
    });
    expect(result.current).toBe(registry);
  });

  it("hydrates dehydratedState into the registry", () => {
    const dehydrated: DehydratedState = {
      queries: { "todos:{}": { type: StatusEnum.FULFILLED, value: { todos: ["1"] } } },
      models: { todo: { "1": { id: "1", title: "Hydrated" } } },
    };
    const { result } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => <StoreProvider dehydratedState={dehydrated}>{children}</StoreProvider>,
    });
    expect(result.current.queries.getQuery("todos:{}").get()).toEqual(createFulfilled({ todos: ["1"] }));
    expect(result.current.model(todoModel).getValue("1")).toEqual({ id: "1", title: "Hydrated" });
  });

  it("ingests window.__RXFY_SSR__ chunks, including late pushes", () => {
    window.__RXFY_SSR__ = [{ queries: {}, models: { todo: { "1": { id: "1", title: "Early" } } } }];
    const { result } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => <StoreProvider ssr>{children}</StoreProvider>,
    });
    expect(result.current.model(todoModel).getValue("1")).toEqual({ id: "1", title: "Early" });

    window.__RXFY_SSR__!.push({ queries: {}, models: { todo: { "2": { id: "2", title: "Late" } } } });
    expect(result.current.model(todoModel).getValue("2")).toEqual({ id: "2", title: "Late" });
    delete window.__RXFY_SSR__;
  });

  it("fans late pushes out to every mounted provider and keeps chunks for later mounts", () => {
    window.__RXFY_SSR__ = [];
    const { result: first } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => <StoreProvider ssr>{children}</StoreProvider>,
    });
    const { result: second } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => <StoreProvider ssr>{children}</StoreProvider>,
    });

    window.__RXFY_SSR__!.push({ queries: {}, models: { todo: { "3": { id: "3", title: "Both" } } } });
    expect(first.current.model(todoModel).getValue("3")).toEqual({ id: "3", title: "Both" });
    expect(second.current.model(todoModel).getValue("3")).toEqual({ id: "3", title: "Both" });

    // chunk stayed in the array, so a provider mounting later still ingests it
    const { result: third } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => <StoreProvider ssr>{children}</StoreProvider>,
    });
    expect(third.current.model(todoModel).getValue("3")).toEqual({ id: "3", title: "Both" });
    delete window.__RXFY_SSR__;
  });
});
