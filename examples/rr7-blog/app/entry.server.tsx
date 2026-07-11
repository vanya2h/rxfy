import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { createModelRegistry } from "rxfy";
import { StoreProvider } from "rxfy-react";
import { hubHydration } from "rxfy-server/hub";
import { ApiProvider, createApiClient } from "./blog/api-client";
import { app } from "./server/app";
import { hub } from "./server/live";

const ABORT_DELAY = 10_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  _loadContext: AppLoadContext,
): Promise<Response> {
  const registry = createModelRegistry();

  return new Promise((resolve, reject) => {
    let shellRendered = false;

    const { pipe, abort } = renderToPipeableStream(
      <StoreProvider registry={registry} ssr>
        <ApiProvider client={createApiClient(app.request)}>
          <ServerRouter context={routerContext} url={request.url} />
        </ApiProvider>
      </StoreProvider>,
      {
        // Buffered: fires once ALL suspended rxfy fetches have settled.
        onAllReady() {
          shellRendered = true;
          const chunks: Buffer[] = [];
          const body = new PassThrough();

          body.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          body.on("end", () => {
            const rendered = Buffer.concat(chunks).toString("utf8");
            // Serving = subscribing: useStateData logged each rendered state's channel into the
            // registry during SSR; hubHydration mints this render's live session, registers the
            // channels under it, and returns the snapshot script (+ session) — injected just
            // before </body> so it runs before RR's deferred client module hydrates.
            const script = hubHydration(hub, registry);
            const html = rendered.replace("</body>", `${script}</body>`);

            responseHeaders.set("Content-Type", "text/html");
            resolve(
              new Response(html, {
                status: responseStatusCode,
                headers: responseHeaders,
              }),
            );
          });

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          // Errors before the shell renders are reported via onShellError (reject);
          // once the shell is committed, log late errors here.
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
