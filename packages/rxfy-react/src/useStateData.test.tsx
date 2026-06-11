import { act, renderHook } from "@testing-library/react";
import { array, createModel, defineState, single } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStore } from "./useModelStore.js";
import { useStateData } from "./useStateData.js";

const postModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "post" });
const userModel = createModel(z.object({ id: z.string(), name: z.string() }), { getKey: (x) => x.id, name: "user" });

type Post = { id: string; title: string };

const pageState = defineState({
  key: "page",
  params: z.object({ page: z.number() }),
  model: { posts: array(postModel) },
  mutations: {
    addPost: (prev, post: Post) => ({ ...prev, posts: [...prev.posts, post] }),
    removePost: (prev, id: string) => ({ ...prev, posts: prev.posts.filter((p) => p.id !== id) }),
  },
});

const singleState = defineState({
  params: z.object({ id: z.string() }),
  model: { user: single(userModel) },
});

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("useStateData", () => {
  it("emits normalized ids for array fields", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      posts: [
        { id: "1", title: "Post 1" },
        { id: "2", title: "Post 2" },
      ],
    });

    const { result } = renderHook(() => useStateData(pageState, fetchFn, { page: 0 }), { wrapper });

    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["1", "2"]);
    expect(fetchFn).toHaveBeenCalledWith({ page: 0 }, expect.any(AbortSignal));
  });

  it("emits a normalized id for single fields", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ user: { id: "u1", name: "Ann" } });
    const { result } = renderHook(() => useStateData(singleState, fetchFn, { id: "u1" }), { wrapper });
    const data = await firstValueFrom(result.current.data$);
    expect(data.user).toBe("u1");
  });

  it("returns new handle when params change", () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });
    const params0 = { page: 0 };
    const params1 = { page: 1 };

    const { result, rerender } = renderHook(({ params }) => useStateData(pageState, fetchFn, params), {
      wrapper,
      initialProps: { params: params0 },
    });

    const first = result.current;
    rerender({ params: params1 });
    expect(result.current).not.toBe(first);
  });

  it("returns same handle when params reference is stable", () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });
    const params = { page: 0 };

    const { result, rerender } = renderHook(() => useStateData(pageState, fetchFn, params), { wrapper });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("normalizes fetched entities into model stores", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "42", title: "Stored" }] });

    const { result } = renderHook(
      () => ({
        handle: useStateData(pageState, fetchFn, { page: 0 }),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );

    await firstValueFrom(result.current.handle.data$);
    expect(result.current.postStore.getValue("42")).toEqual({ id: "42", title: "Stored" });
  });

  it("mutations accept full entities: denormalize → reduce → normalize", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "1", title: "A" }] });
    const { result } = renderHook(
      () => ({
        handle: useStateData(pageState, fetchFn, { page: 0 }),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );
    await firstValueFrom(result.current.handle.data$);

    act(() => result.current.handle.mutations.addPost({ id: "2", title: "B" }));

    const data = await firstValueFrom(result.current.handle.data$);
    expect(data.posts).toEqual(["1", "2"]);
    // entity landed in the model store via normalize — no manual store.set needed
    expect(result.current.postStore.getValue("2")).toEqual({ id: "2", title: "B" });
  });

  it("mutation reducers see the freshest store values (websocket scenario)", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "1", title: "Original" }] });
    let seenTitle = "";
    const spyState = defineState({
      params: z.object({}),
      model: { posts: array(postModel) },
      mutations: {
        touch: (prev) => {
          seenTitle = prev.posts[0]?.title ?? "";
          return prev;
        },
      },
    });
    const { result } = renderHook(
      () => ({
        handle: useStateData(spyState, fetchFn, {}),
        postStore: useModelStore(postModel),
      }),
      { wrapper },
    );
    await firstValueFrom(result.current.handle.data$);

    // simulate a websocket write
    act(() => result.current.postStore.set("1", { id: "1", title: "From socket" }));
    act(() => result.current.handle.mutations.touch());

    expect(seenTitle).toBe("From socket");
  });

  it("set() accepts the full fetch shape", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "1", title: "A" }] });
    const { result } = renderHook(() => useStateData(pageState, fetchFn, { page: 0 }), { wrapper });
    await firstValueFrom(result.current.data$);

    act(() => result.current.set({ posts: [{ id: "9", title: "Replaced" }] }));

    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["9"]);
  });

  it("set() with an updater receives denormalized entities", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [{ id: "1", title: "A" }] });
    const { result } = renderHook(() => useStateData(pageState, fetchFn, { page: 0 }), { wrapper });
    await firstValueFrom(result.current.data$);

    let seen: Post[] = [];
    act(() =>
      result.current.set((prev) => {
        seen = prev.posts;
        return prev;
      }),
    );

    expect(seen).toEqual([{ id: "1", title: "A" }]);
  });
});
