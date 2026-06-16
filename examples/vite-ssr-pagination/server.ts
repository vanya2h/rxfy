/* eslint-disable turbo/no-undeclared-env-vars */
import fs from "node:fs/promises";
import { Transform } from "node:stream";
import express from "express";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { getUsersPage } from "./shared/generate.ts";

type RenderResult = {
  pipe: ReturnType<typeof import("react-dom/server").renderToPipeableStream>["pipe"];
  abort: () => void;
  getState: () => string;
};
type Render = (url: string, options?: RenderToPipeableStreamOptions) => RenderResult;

const isProduction = process.env.NODE_ENV === "production";
const port = process.env.PORT || 5176;
const base = process.env.BASE || "/";
const ABORT_DELAY = 10000;

const templateHtml = isProduction ? await fs.readFile("./dist/client/index.html", "utf-8") : "";

const app = express();

let vite: import("vite").ViteDevServer | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  vite = await createServer({ server: { middlewareMode: true }, appType: "custom", base });
  app.use(vite.middlewares);
} else {
  const compression = (await import("compression")).default;
  const sirv = (await import("sirv")).default;
  app.use(compression());
  app.use(base, sirv("./dist/client", { extensions: [] }));
}

// Pagination API — the browser hits this for pages after the first.
app.get("/api/users", (req, res) => {
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
  res.json(getUsersPage(cursor));
});

app.use("*all", async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, "");

    let template: string;
    let render: Render;
    if (!isProduction) {
      template = await fs.readFile("./index.html", "utf-8");
      template = await vite!.transformIndexHtml(url, template);
      render = (await vite!.ssrLoadModule("/src/entry-server.tsx")).render as Render;
    } else {
      template = templateHtml;
      // @ts-expect-error — dist artifact has no .d.ts
      render = ((await import("./dist/server/entry-server.js")) as { render: Render }).render;
    }

    let didError = false;
    const { pipe, abort, getState } = render(url, {
      onShellError() {
        res.status(500).set({ "Content-Type": "text/html" }).send("<h1>Something went wrong</h1>");
      },
      onShellReady() {
        res.status(didError ? 500 : 200).set({ "Content-Type": "text/html" });

        const [htmlStart, rest] = template.split("<!--app-html-->");
        const [htmlMiddle, htmlEnd] = rest.split("<!--app-state-->");

        const transformStream = new Transform({
          transform(chunk, encoding, callback) {
            res.write(chunk, encoding);
            callback();
          },
        });
        transformStream.on("finish", () => {
          // snapshot script goes after the app markup, before the client bootstrap script
          res.write(htmlMiddle);
          res.write(getState());
          res.write(htmlEnd);
          res.end();
        });

        res.write(htmlStart);
        pipe(transformStream);
      },
      onError(error) {
        didError = true;
        console.error(error);
      },
    });

    setTimeout(() => abort(), ABORT_DELAY);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    vite?.ssrFixStacktrace(err);
    console.log(err.stack);
    res.status(500).end(err.stack);
  }
});

app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});
