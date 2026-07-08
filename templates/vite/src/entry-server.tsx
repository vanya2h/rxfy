import { PassThrough } from "node:stream";
import { StrictMode, Suspense } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import { live } from "../server/live.js";
import { App } from "./App.js";
import { todoResource } from "./resources.js";
import { routeStates } from "./routes.js";

export function render(url: string): Promise<{ html: string; state: string }> {
  const registry = createModelRegistry();
  const pathname = new URL(url, "http://localhost").pathname;

  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <StrictMode>
        <StoreProvider registry={registry} ssr>
          <Suspense fallback={null}>
            <StaticRouter location={url}>
              <App />
            </StaticRouter>
          </Suspense>
        </StoreProvider>
      </StrictMode>,
      {
        onAllReady() {
          const sink = new PassThrough();
          let html = "";
          sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
          sink.on("end", () => {
            // Grants must be minted AFTER the render: only entities/channels actually
            // fetched into the registry are grantable.
            const grants = live.grant(registry, {
              entities: [todoResource],
              states: routeStates(pathname),
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
