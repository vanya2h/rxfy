import { act, renderHook, waitFor } from "@testing-library/react";
import { array, createModel, defineState } from "rxfy";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useStatePagedData } from "./useStatePagedData.js";

const postModel = createModel(z.object({ id: z.string(), title: z.string() }), { getKey: (x) => x.id, name: "post" });

type Post = { id: string; title: string };
type PostShape = { posts: Post[] };
type PostPage = { items: Post[]; nextCursor: number };

const pagedState = defineState({
  key: "paged",
  params: z.object({}),
  model: { posts: array(postModel) },
});

// Stable references — config callbacks may be fresh each render (the hook stabilizes them),
// but `params` must be referentially stable or useStateData rebuilds + refetches every render.
const PARAMS = {};
const INITIAL: PostShape = { posts: [] };
const getCursor = ({ ids }: { ids: { posts: string[] }; pageIndex: number }) => ids.posts.length;
const merge = ({ prev, page }: { prev: PostShape; page: PostPage }) => ({ posts: [...prev.posts, ...page.items] });

/** A page of `count` posts starting at numeric id `start`. */
const page = (start: number, count: number): PostPage => ({
  items: Array.from({ length: count }, (_, i) => ({ id: String(start + i), title: `P${start + i}` })),
  nextCursor: start + count,
});

const wrapper = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("useStatePagedData", () => {
  it("fetches and normalizes page 0 through fetchPage + merge", async () => {
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) => Promise.resolve(page(cursor, 2)));
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );

    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["0", "1"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ cursor: 0 }));
  });

  it("loadMore appends the next page and advances the cursor", async () => {
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) => Promise.resolve(page(cursor, 2)));
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$); // page 0 → ids "0","1"

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));

    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["0", "1", "2", "3"]);
    // cursor for page 1 = number of loaded ids (offset-based getCursor)
    expect(fetchPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 2 }));
  });

  it("ignores a second loadMore while one is in flight", async () => {
    let resolveSecond!: (p: PostPage) => void;
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) =>
      cursor === 0 ? Promise.resolve(page(0, 2)) : new Promise<PostPage>((r) => (resolveSecond = r)),
    );
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$);

    act(() => {
      result.current.loadMore();
      result.current.loadMore(); // guarded — the first is still in flight
    });
    expect(fetchPage).toHaveBeenCalledTimes(2); // page 0 + exactly one loadMore

    await act(async () => {
      resolveSecond(page(2, 2));
    });
  });

  it("flips isLoading around a loadMore", async () => {
    let resolveSecond!: (p: PostPage) => void;
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) =>
      cursor === 0 ? Promise.resolve(page(0, 2)) : new Promise<PostPage>((r) => (resolveSecond = r)),
    );
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$);

    act(() => result.current.loadMore());
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSecond(page(2, 2));
    });
    expect(result.current.isLoading).toBe(false);
  });

  it("stops paging once hasMore returns false", async () => {
    const hasMore = ({ page }: { page: PostPage }) => page.items.length === 2;
    // page 0 → 2 items (hasMore true); page 1 → 1 item (hasMore false).
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) =>
      Promise.resolve(cursor === 0 ? page(0, 2) : page(2, 1)),
    );
    const { result } = renderHook(
      () =>
        useStatePagedData({
          state: pagedState,
          params: PARAMS,
          initial: INITIAL,
          fetchPage,
          getCursor,
          merge,
          hasMore,
        }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.hasMore).toBe(false));

    result.current.loadMore(); // guarded by hasMore — no fetch
    expect(fetchPage).toHaveBeenCalledTimes(2); // page 0 + one loadMore only
  });

  it("surfaces hasMore=false straight from page 0 (no loadMore needed)", async () => {
    const hasMore = ({ page }: { page: PostPage }) => page.items.length === 2;
    // Page 0 itself is terminal (1 item) — hasMore must flip without any loadMore. This is the
    // page-0 path: the result is mirrored into render state from the data$ subscription effect.
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) => Promise.resolve(page(cursor, 1)));
    const { result } = renderHook(
      () =>
        useStatePagedData({
          state: pagedState,
          params: PARAMS,
          initial: INITIAL,
          fetchPage,
          getCursor,
          merge,
          hasMore,
        }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$);
    await waitFor(() => expect(result.current.hasMore).toBe(false));

    result.current.loadMore(); // guarded by hasMore — no fetch
    expect(fetchPage).toHaveBeenCalledTimes(1); // only page 0, never a loadMore
  });
});
