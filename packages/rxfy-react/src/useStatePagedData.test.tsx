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

const filterState = defineState({
  key: "paged-filter",
  params: z.object({ filter: z.string() }),
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

  it("reload refetches page 0 and resets the cursor", async () => {
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) => Promise.resolve(page(cursor, 2)));
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$);
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2)); // cursor 0, then 2

    act(() => result.current.reload());
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3));

    // reload cleared the keyed cache; pageIndex/ids reset → page 0 refetched at cursor 0
    expect(fetchPage).toHaveBeenNthCalledWith(3, expect.objectContaining({ cursor: 0 }));
    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["0", "1"]);
  });

  it("restarts the page index after reload (page-number cursor)", async () => {
    // A page-number cursor depends on the running pageIndex (unlike offset, which self-heals from
    // idsRef). This isolates the reset effect: without it, the post-reload loadMore would reuse the
    // stale pageIndex and fetch the wrong page.
    const byPage = ({ pageIndex }: { ids: { posts: string[] }; pageIndex: number }) => pageIndex;
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) => Promise.resolve(page(cursor * 2, 2)));
    const { result } = renderHook(
      () =>
        useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor: byPage, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$); // page 0 → cursor 0
    await act(async () => {
      result.current.loadMore(); // getCursor sees pageIndex 1 → cursor 1; pageIndexRef then advances to 2
    });
    await waitFor(() => expect(fetchPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: 1 })));

    act(() => result.current.reload());
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3)); // reload → page 0, cursor 0
    await firstValueFrom(result.current.data$);

    await act(async () => {
      result.current.loadMore(); // pageIndex reset to 1 → cursor 1 (NOT the stale 2)
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(4));
    expect(fetchPage).toHaveBeenNthCalledWith(4, expect.objectContaining({ cursor: 1 }));
  });

  it("resets pagination and refetches page 0 when params change", async () => {
    // fetchPage returns param-specific ids so we can tell the new query's page 0 apart from the
    // old accumulated list — proving the change resets rather than appends.
    const fetchPage = vi.fn(({ cursor, params }: { cursor: number; params: { filter: string } }) =>
      Promise.resolve(page(params.filter === "a" ? cursor : cursor + 100, 2)),
    );
    const paramsA = { filter: "a" };
    const paramsB = { filter: "b" };
    const { result, rerender } = renderHook(
      ({ params }: { params: { filter: string } }) =>
        useStatePagedData({ state: filterState, params, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper, initialProps: { params: paramsA } },
    );
    await firstValueFrom(result.current.data$); // filter "a" page 0 → ids "0","1"
    await act(async () => {
      result.current.loadMore();
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2)); // ids "0".."3"

    rerender({ params: paramsB }); // new params → new handle → reset + refetch page 0
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3));
    expect(fetchPage).toHaveBeenNthCalledWith(3, expect.objectContaining({ cursor: 0, params: paramsB }));

    // list is the fresh filter-"b" page 0, not the old accumulated filter-"a" list
    const data = await firstValueFrom(result.current.data$);
    expect(data.posts).toEqual(["100", "101"]);
  });

  it("a failed loadMore leaves the list intact, clears isLoading, and allows a retry", async () => {
    let loadAttempts = 0;
    const fetchPage = vi.fn(({ cursor }: { cursor: number }) => {
      if (cursor === 0) return Promise.resolve(page(0, 2));
      loadAttempts += 1;
      return loadAttempts === 1 ? Promise.reject(new Error("boom")) : Promise.resolve(page(2, 2));
    });
    const { result } = renderHook(
      () => useStatePagedData({ state: pagedState, params: PARAMS, initial: INITIAL, fetchPage, getCursor, merge }),
      { wrapper },
    );
    await firstValueFrom(result.current.data$); // ids "0","1"

    await act(async () => {
      result.current.loadMore(); // rejects
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect((await firstValueFrom(result.current.data$)).posts).toEqual(["0", "1"]); // unchanged

    await act(async () => {
      result.current.loadMore(); // retry succeeds — guard was cleared by .finally
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3));
    expect((await firstValueFrom(result.current.data$)).posts).toEqual(["0", "1", "2", "3"]);
  });
});
