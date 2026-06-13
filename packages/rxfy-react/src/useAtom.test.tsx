import { act, renderHook } from "@testing-library/react";
import { createAtom } from "rxfy";
import { describe, expect, it } from "vitest";
import { useAtom } from "./useAtom.js";

describe("useAtom", () => {
  it("returns the current value and a setter, and re-renders on external change", () => {
    const atom$ = createAtom(1);
    const { result } = renderHook(() => useAtom(atom$));
    expect(result.current[0]).toBe(1);

    act(() => result.current[1](2));
    expect(result.current[0]).toBe(2);
    expect(atom$.get()).toBe(2);

    act(() => atom$.set(3));
    expect(result.current[0]).toBe(3);
  });
});
