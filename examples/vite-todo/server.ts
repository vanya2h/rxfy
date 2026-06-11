/* eslint-disable turbo/no-undeclared-env-vars */
import fs from "node:fs/promises";
import express from "express";

// Constants
const isProduction = process.env.NODE_ENV === "production";
const port = process.env.PORT || 5175;
const base = process.env.BASE || "/";

// Cached production assets
const templateHtml = isProduction ? await fs.readFile("./dist/client/index.html", "utf-8") : "";

// Create http server
const app = express();

// Add Vite or respective production middlewares
let vite: import("vite").ViteDevServer | undefined;
if (!isProduction) {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    base,
  });
  app.use(vite.middlewares);
} else {
  const compression = (await import("compression")).default;
  const sirv = (await import("sirv")).default;
  app.use(compression());
  app.use(base, sirv("./dist/client", { extensions: [] }));
}

// Serve HTML
app.use("*all", async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, "");

    let template: string;
    let render: (url: string) => Promise<{ html: string; state: string }>;
    if (!isProduction) {
      // Always read fresh template in development
      template = await fs.readFile("./index.html", "utf-8");
      template = await vite!.transformIndexHtml(url, template);
      render = (await vite!.ssrLoadModule("/src/entry-server.tsx")).render;
    } else {
      template = templateHtml;
      // @ts-expect-error — dist artifact has no .d.ts
      render = ((await import("./dist/server/entry-server.js")) as { render: typeof render }).render;
    }

    const rendered = await render(url);

    const html = template
      .replace(`<!--app-html-->`, rendered.html)
      .replace(`<!--app-state-->`, `<script>window.__RXFY_STATE__=${rendered.state}</script>`);

    res.status(200).set({ "Content-Type": "text/html" }).send(html);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    vite?.ssrFixStacktrace(err);
    console.log(err.stack);
    res.status(500).end(err.stack);
  }
});

// Start http server
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});
