import { PassThrough } from "node:stream";
import { StrictMode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import App from "./App";
import { parseFilter } from "./todos.ts";

export function render(url: string): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry();
  // ?filter=all|active|done drives the initial view — the client entry parses the same param
  const filter = parseFilter(new URL(url, "http://rxfy.local").searchParams.get("filter"));

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <App initialFilter={filter} />
        </StoreProvider>
      </StrictMode>,
      {
        // buffered mode: wait for every Suspense boundary, then emit the full document at once
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => resolve({ html, state: hydrationScript(dehydrate(registry)) }));
          pipe(sink);
        },
        onError(error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      },
    );
  });
}
