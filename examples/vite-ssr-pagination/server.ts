/* eslint-disable turbo/no-undeclared-env-vars */
import fs from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { PassThrough, Readable, Transform } from "node:stream";
import { pathToFileURL } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { ViteDevServer } from "vite";
import { api } from "./server/api.ts";

/** The SSR entry module, typed straight off the source — `render`'s signature can never drift. */
type EntryServer = typeof import("./src/entry-server.tsx");

const isProduction = process.env.NODE_ENV === "production";
const port = process.env.PORT || 5176;
const ABORT_DELAY = 10000;

const app = new Hono();

app.route("/api", api);

let vite: ViteDevServer | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
} else {
  app.use("/assets/*", serveStatic({ root: "./dist/client" }));
  app.use("/favicon.svg", serveStatic({ root: "./dist/client" }));
}

/** Load the html template + SSR entry for the current environment. */
async function loadEntry(url: string): Promise<{ template: string; render: EntryServer["render"] }> {
  if (!isProduction) {
    const template = await vite!.transformIndexHtml(url, await fs.readFile("./index.html", "utf-8"));
    const { render } = (await vite!.ssrLoadModule("/src/entry-server.tsx")) as EntryServer;
    return { template, render };
  }
  const template = await fs.readFile("./dist/client/index.html", "utf-8");
  const entryUrl = pathToFileURL(path.resolve(process.cwd(), "dist/server/entry-server.js")).href;
  const { render } = (await import(entryUrl)) as EntryServer;
  return { template, render };
}

app.get("*", async (c) => {
  const url = c.req.path;
  try {
    const { template, render } = await loadEntry(url);
    const [htmlStart, rest] = template.split("<!--app-html-->");
    const [htmlMiddle, htmlEnd] = rest!.split("<!--app-state-->");

    return await new Promise<Response>((resolve) => {
      let didError = false;
      // SSR data fetching goes through the server's own endpoints, in-process (`api.request`).
      const { pipe, abort, getState } = render(url, api.request, {
        onShellError(error) {
          console.error(error);
          resolve(c.html("<h1>Something went wrong</h1>", 500));
        },
        // Pipe once ALL suspended data has settled — React then emits the resolved markup in
        // place, with no hidden late chunks or inline reveal scripts, so the page renders fully
        // even with JavaScript disabled (progressive `onShellReady` streaming needs JS to swap
        // each boundary's content in).
        onAllReady() {
          const body = new PassThrough();
          body.write(htmlStart);

          const reactStream = new Transform({
            transform(chunk, encoding, callback) {
              body.write(chunk, encoding);
              callback();
            },
          });
          reactStream.on("finish", () => {
            // snapshot script goes after the app markup, before the client bootstrap script
            body.write(htmlMiddle);
            body.write(getState());
            body.end(htmlEnd);
          });
          pipe(reactStream);

          resolve(
            c.body(Readable.toWeb(body) as unknown as ReadableStream, didError ? 500 : 200, {
              "Content-Type": "text/html",
            }),
          );
        },
        onError(error) {
          didError = true;
          console.error(error);
        },
      });
      setTimeout(() => abort(), ABORT_DELAY);
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    vite?.ssrFixStacktrace(err);
    console.error(err.stack);
    return c.text(err.stack ?? String(err), 500);
  }
});

const honoListener = getRequestListener(app.fetch);
const server = createHttpServer((req, res) => {
  if (vite) vite.middlewares(req, res, () => honoListener(req, res));
  else honoListener(req, res);
});
server.listen(port, () => console.log(`Server started at http://localhost:${port}`));
