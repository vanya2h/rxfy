import { renderHook } from "@testing-library/react";
import { createModelRegistry } from "rxfy";
import { describe, expect, it } from "vitest";
import { ModelRegistryContext, useModelRegistry } from "./registry-context.js";

describe("useModelRegistry", () => {
  it("throws when used outside a provider", () => {
    expect(() => renderHook(() => useModelRegistry())).toThrow("StoreProvider not found");
  });

  it("returns the registry from context", () => {
    const registry = createModelRegistry();
    const { result } = renderHook(() => useModelRegistry(), {
      wrapper: ({ children }) => (
        <ModelRegistryContext.Provider value={registry}>
          {children}
        </ModelRegistryContext.Provider>
      ),
    });
    expect(result.current).toBe(registry);
  });
});
