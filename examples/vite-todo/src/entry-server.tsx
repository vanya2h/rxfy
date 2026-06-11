import { PassThrough } from "node:stream";
import { StrictMode } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry, dehydrate, serializeForHtml } from "rxfy";
import { StoreProvider } from "rxfy-react";
import App from "./App";

export function render(_url: string): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry();

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <App />
        </StoreProvider>
      </StrictMode>,
      {
        // buffered mode: wait for every Suspense boundary, then emit the full document at once
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => resolve({ html, state: serializeForHtml(dehydrate(registry)) }));
          pipe(sink);
        },
        onError(error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      },
    );
  });
}
