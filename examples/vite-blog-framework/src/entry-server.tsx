import { PassThrough } from "node:stream";
import { StrictMode, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import { live } from "../server/live.js";
import { commentResource, postResource, userResource } from "./blog/resources.js";
import { App } from "./App.js";
import { matchRoute, routeStates } from "./routes.js";

export function render(url: string): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry();
  const route = matchRoute(new URL(url, "http://localhost").pathname);

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
            const grants = live.grant(registry, {
              entities: [postResource, userResource, commentResource],
              states: routeStates(route),
            });
            resolve({ html, state: hydrationScript({ ...dehydrate(registry), grants }) });
          });
          pipe(sink);
        },
        onError: (error) => reject(error instanceof Error ? error : new Error(String(error))),
      },
    );
  });
}
