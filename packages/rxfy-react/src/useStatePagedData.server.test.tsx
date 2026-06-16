// @vitest-environment node
import { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { array, createModel, createModelRegistry, defineState, type IModelRegistry } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Pending } from "./Pending.js";
import { StoreProvider } from "./StoreProvider.js";
import { useStatePagedData } from "./useStatePagedData.js";

// Distinct model name from the jsdom test file to avoid any cross-file registration collisions.
const postModel = createModel(z.object({ id: z.string(), title: z.string() }), {
  getKey: (x) => x.id,
  name: "ssr-paged-post",
});

type Post = { id: string; title: string };
type PostPage = { items: Post[]; nextCursor: number };

const pagedState = defineState({
  key: "ssr-paged",
  params: z.object({}),
  model: { posts: array(postModel) },
});

type FetchPage = (args: { cursor: number; params: object; signal: AbortSignal }) => Promise<PostPage>;

function PagedWidget({ fetchPage }: { fetchPage: FetchPage }) {
  const { data$ } = useStatePagedData({
    state: pagedState,
    params: {},
    fetchPage,
    getCursor: ({ ids }: { ids: { posts: string[] }; pageIndex: number }) => ids.posts.length,
    select: ({ page }: { page: PostPage }) => ({ posts: page.items }),
  });
  return (
    <Pending value$={data$}>
      {({ posts }) => (
        <ul>
          {posts.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      )}
    </Pending>
  );
}

function renderApp(registry: IModelRegistry, fetchPage: FetchPage) {
  return renderToString(
    <StoreProvider registry={registry} ssr>
      <Suspense fallback="loading">
        <PagedWidget fetchPage={fetchPage} />
      </Suspense>
    </StoreProvider>,
  );
}

describe("useStatePagedData server suspend (ssr mode)", () => {
  it("page-0 cache miss: calls fetchPage once (cursor 0) and suspends", () => {
    const registry = createModelRegistry();
    const fetchPage = vi.fn(() => new Promise<PostPage>(() => {})); // never resolves → suspends

    const html = renderApp(registry, fetchPage);

    expect(html).toContain("loading");
    expect(fetchPage).toHaveBeenCalledOnce();
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({ cursor: 0 }));
    expect(registry.queries.inflight()).toHaveLength(1);
  });

  it("after settle, re-render produces fulfilled HTML from the cache (page 0 merged into initial)", async () => {
    const registry = createModelRegistry();
    const fetchPage = vi.fn(() => Promise.resolve({ items: [{ id: "1", title: "A" }], nextCursor: 1 }));

    renderApp(registry, fetchPage); // first pass — suspends, promise stored
    await Promise.all(registry.queries.inflight());

    const html = renderApp(registry, fetchPage); // second pass — cache hit
    expect(html).toContain("<li>1</li>");
    expect(fetchPage).toHaveBeenCalledOnce();
    // entity normalized at settle — page 0 went through merge(initial, page) then normalizeResult
    expect(registry.model(postModel).getValue("1")).toEqual({ id: "1", title: "A" });
  });
});
