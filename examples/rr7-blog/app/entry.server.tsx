import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";

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
        <ServerRouter context={routerContext} url={request.url} />
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
            // Inject the rxfy snapshot just before </body> so it runs before
            // RR's deferred client module hydrates.
            const script = hydrationScript(dehydrate(registry));
            const html = rendered.replace("</body>", `${script}</body>`);

            responseHeaders.set("Content-Type", "text/html");
            resolve(
              new Response(html, {
                status: shellRendered ? responseStatusCode : 500,
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
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}
