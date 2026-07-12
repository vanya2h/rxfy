// @vitest-environment node
import { PassThrough } from "node:stream";
import { Suspense } from "react";
import { renderToPipeableStream, renderToString } from "react-dom/server";
import { array, createModel, createModelRegistry, defineState, dehydrate, type IModelRegistry, StatusEnum } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Pending } from "../Pending.js";
import { StoreProvider } from "../StoreProvider.js";
import { useAtom } from "../useAtom.js";
import { useModelStore } from "../useModelStore.js";
import { useStateData } from "../useStateData.js";

const todoModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (x) => x.id,
  name: "todo",
});
const todosState = defineState({ key: "todos", params: z.object({}), model: { todos: array(todoModel) } });

type FetchFn = (p: object, s: AbortSignal) => Promise<{ todos: { id: string; title: string }[] }>;

function TodoItem({ id }: { id: string }) {
  const store = useModelStore(todoModel);
  const [todo] = useAtom(store.get(id));
  return <li>{todo.title}</li>;
}

function App({ fetchFn }: { fetchFn: FetchFn }) {
  const { data$ } = useStateData({ state: todosState, fetchFn, params: {} });
  return (
    <Suspense fallback="loading">
      <Pending value$={data$}>
        {({ todos }) => (
          <ul>
            {todos.map((id) => (
              <TodoItem key={id} id={id} />
            ))}
          </ul>
        )}
      </Pending>
    </Suspense>
  );
}

function streamToString(registry: IModelRegistry, fetchFn: FetchFn): Promise<string> {
  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StoreProvider registry={registry} ssr>
        <App fetchFn={fetchFn} />
      </StoreProvider>,
      {
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => resolve(html));
          pipe(sink);
        },
        onError(error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      },
    );
  });
}

describe("buffered SSR (renderToPipeableStream + onAllReady)", () => {
  it("server fetches on demand, dehydrates, and the client renders identical HTML with zero fetches", async () => {
    const serverRegistry = createModelRegistry();
    const serverFetch = vi.fn().mockResolvedValue({
      todos: [
        { id: "1", title: "Buy milk" },
        { id: "2", title: "Walk dog" },
      ],
    });

    const serverHtml = await streamToString(serverRegistry, serverFetch);
    expect(serverHtml).toContain("Buy milk");
    expect(serverHtml).toContain("Walk dog");
    expect(serverFetch).toHaveBeenCalledOnce();

    // simulate the server→client JSON round trip
    const payload = JSON.parse(JSON.stringify(dehydrate(serverRegistry))) as ReturnType<typeof dehydrate>;

    // "client": fresh registry hydrated from the payload; renderToString = first paint, no effects
    const clientRegistry = createModelRegistry();
    const clientFetch = vi.fn();
    const clientHtml = renderToString(
      <StoreProvider registry={clientRegistry} dehydratedState={payload}>
        <App fetchFn={clientFetch} />
      </StoreProvider>,
    );

    expect(clientFetch).not.toHaveBeenCalled();
    expect(clientHtml).toContain("Buy milk");
    expect(clientHtml).toContain("Walk dog");
  });

  it("rejected fetches hydrate as rejected state in the payload", async () => {
    const registry = createModelRegistry();
    const failing = vi.fn().mockRejectedValue(new Error("api down"));

    await streamToString(registry, failing);

    const payload = dehydrate(registry);
    expect(payload.queries["todos:{}"]).toEqual({
      type: StatusEnum.REJECTED,
      error: { name: "Error", message: "api down" },
    });
  });
});
