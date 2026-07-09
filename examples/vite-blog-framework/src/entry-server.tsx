import { PassThrough } from "node:stream";
import { StrictMode, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry } from "rxfy";
import { StoreProvider } from "rxfy-react";
import type { Live } from "rxfy-server";
import { App } from "./App.js";

export function render(url: string, live: Live): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry();

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <Suspense fallback={null}>
            <App url={url} />
          </Suspense>
        </StoreProvider>
      </StrictMode>,
      {
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => {
            // hydration() mints this render's session and embeds it alongside the dehydrated
            // registry — the server tracks everything served to the session and pushes updates.
            resolve({ html, state: live.hydration(registry) });
          });
          pipe(sink);
        },
        onError: (error) => reject(error instanceof Error ? error : new Error(String(error))),
      },
    );
  });
}
