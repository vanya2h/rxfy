import { act, renderHook } from "@testing-library/react";
import { array, createModel, defineState } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useStateData } from "./useStateData.js";

const todoModel = createModel(z.object({ id: z.string(), title: z.string() }), {
  getKey: (x) => x.id,
  name: "local-todo",
});

const counterState = defineState({
  params: z.object({}),
  model: { count: z.number(), todos: array(todoModel), isOpen: z.boolean() },
  mutations: {
    inc: (prev) => ({ ...prev, count: prev.count + 1 }),
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("useStateData local mode", () => {
  it("emits the initial value synchronously with no fetch", async () => {
    const { result } = renderHook(
      () =>
        useStateData({
          state: counterState,
          initial: { count: 5, todos: [{ id: "1", title: "A" }], isOpen: false },
        }),
      { wrapper },
    );
    // markSync path: a synchronous subscriber must receive the value immediately (no PENDING flush).
    let syncValue: { count: number } | undefined;
    result.current.data$.subscribe((v) => (syncValue = v as { count: number })).unsubscribe();
    expect(syncValue?.count).toBe(5);

    const data = await firstValueFrom(result.current.data$);
    expect(data.count).toBe(5);
    expect(data.todos).toEqual(["1"]);
    expect(data.isOpen).toBe(false);
  });

  it("updates via mutations and set", async () => {
    const { result } = renderHook(
      () => useStateData({ state: counterState, initial: { count: 0, todos: [], isOpen: false } }),
      { wrapper },
    );
    act(() => result.current.mutations.inc());
    expect((await firstValueFrom(result.current.data$)).count).toBe(1);
    act(() => result.current.set((prev) => ({ ...prev, isOpen: true })));
    expect((await firstValueFrom(result.current.data$)).isOpen).toBe(true);
  });

  it("reload() resets to the initial value", async () => {
    const { result } = renderHook(
      () => useStateData({ state: counterState, initial: { count: 0, todos: [], isOpen: false } }),
      { wrapper },
    );
    act(() => result.current.mutations.inc());
    expect((await firstValueFrom(result.current.data$)).count).toBe(1);
    act(() => result.current.reload());
    expect((await firstValueFrom(result.current.data$)).count).toBe(0);
  });
});
