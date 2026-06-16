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
});
