import { renderHook } from "@testing-library/react";
import { array, createModel, defineState, single } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useStateData } from "./useStateData.js";
import { useModelStore } from "./useModelStore.js";

const postModel = createModel(
  z.object({ id: z.string(), title: z.string() }),
  { getKey: (x) => x.id },
);
const userModel = createModel(
  z.object({ id: z.string(), name: z.string() }),
  { getKey: (x) => x.id },
);

const pageState = defineState({
  params: z.object({ page: z.number() }),
  model: { posts: array(postModel) },
});

const singleState = defineState({
  params: z.object({ id: z.string() }),
  model: { user: single(userModel) },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StoreProvider>{children}</StoreProvider>
);

describe("useStateData", () => {
  it("emits fetched data", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [
        { id: "1", title: "Post 1" },
        { id: "2", title: "Post 2" },
      ],
    });

    const { result } = renderHook(
      () => useStateData(pageState, fetchFn, { page: 0 }),
      { wrapper },
    );

    const data = await firstValueFrom(result.current);
    expect(data.posts).toEqual([
      { id: "1", title: "Post 1" },
      { id: "2", title: "Post 2" },
    ]);
    expect(fetchFn).toHaveBeenCalledWith({ page: 0 });
  });

  it("returns new observable instance when params change", () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });
    const params0 = { page: 0 };
    const params1 = { page: 1 };

    const { result, rerender } = renderHook(
      ({ params }) => useStateData(pageState, fetchFn, params),
      { wrapper, initialProps: { params: params0 } },
    );

    const first = result.current;
    rerender({ params: params1 });
    expect(result.current).not.toBe(first);
  });

  it("returns same observable instance when params reference is stable", () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });
    const params = { page: 0 };

    const { result, rerender } = renderHook(
      () => useStateData(pageState, fetchFn, params),
      { wrapper },
    );

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("normalizes array into model store — store observable emits", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [{ id: "42", title: "Stored" }],
    });

    const { result } = renderHook(
      () => ({
        obs$: useStateData(pageState, fetchFn, { page: 0 }),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );

    await firstValueFrom(result.current.obs$);
    const post = await firstValueFrom(result.current.postStore.get("42"));
    expect(post).toEqual({ id: "42", title: "Stored" });
  });

  it("reactive: model store update re-emits from state observable", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [{ id: "1", title: "v1" }],
    });

    const { result } = renderHook(
      () => ({
        obs$: useStateData(pageState, fetchFn, { page: 0 }),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );

    const emissions: Array<{ posts: Array<{ id: string; title: string }> }> = [];
    const sub = result.current.obs$.subscribe((v) => emissions.push(v));

    await new Promise((res) => setTimeout(res, 10));
    result.current.postStore.set("1", { id: "1", title: "v2" });
    await new Promise((res) => setTimeout(res, 0));
    sub.unsubscribe();

    expect(emissions.length).toBeGreaterThanOrEqual(2);
    expect(emissions[emissions.length - 1].posts[0].title).toBe("v2");
  });

  it("handles empty array field", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });

    const { result } = renderHook(
      () => useStateData(pageState, fetchFn, { page: 0 }),
      { wrapper },
    );

    const data = await firstValueFrom(result.current);
    expect(data.posts).toEqual([]);
  });

  it("handles single field descriptor", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      user: { id: "u1", name: "Alice" },
    });

    const { result } = renderHook(
      () => useStateData(singleState, fetchFn, { id: "u1" }),
      { wrapper },
    );

    const data = await firstValueFrom(result.current);
    expect(data.user).toEqual({ id: "u1", name: "Alice" });
  });

  it("propagates fetch rejection as observable error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(
      () => useStateData(pageState, fetchFn, { page: 0 }),
      { wrapper },
    );

    await expect(firstValueFrom(result.current)).rejects.toThrow("Network error");
  });
});
