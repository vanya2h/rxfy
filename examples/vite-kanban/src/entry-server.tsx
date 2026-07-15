import { PassThrough } from "node:stream";
import { StrictMode, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry } from "rxfy";
import { StoreProvider } from "rxfy-react";
import type { RenderFn } from "../server/render-types.js";
import { ApiProvider, createApiClient } from "./kanban/api-client.js";
import { App } from "./App.js";

export const render: RenderFn = (_url, sync, apiFetch) => {
  const apiClient = createApiClient(apiFetch);
  const registry = createModelRegistry();

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <ApiProvider client={apiClient}>
            <Suspense fallback={null}>
              <App />
            </Suspense>
          </ApiProvider>
        </StoreProvider>
      </StrictMode>,
      {
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => {
            resolve({ html, state: sync.hydration(registry) });
          });
          pipe(sink);
        },
        onError: (error) => reject(error instanceof Error ? error : new Error(String(error))),
      },
    );
  });
};
