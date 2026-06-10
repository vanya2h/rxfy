import { renderHook } from "@testing-library/react";
import { createModel } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStore } from "./useModelStore.js";

const testModel = createModel(z.object({ id: z.string() }), { getKey: (x) => x.id });

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
