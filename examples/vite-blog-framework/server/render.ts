import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ViteDevServer } from "vite";
import { api } from "./api.js";
import type { RenderFn } from "./render-types.js";
import { sync } from "./sync.js";

export async function renderPage(url: string, vite: ViteDevServer | undefined, isProduction: boolean): Promise<string> {
  let template: string;
  let render: RenderFn;
  if (!isProduction) {
    if (!vite) throw new Error("vite dev server is required outside production");
    template = await fs.readFile("./index.html", "utf-8");
    template = await vite.transformIndexHtml(url, template);
    render = (await vite.ssrLoadModule("/src/entry-server.tsx")).render;
  } else {
    template = await fs.readFile("./dist/client/index.html", "utf-8");
    const entryUrl = pathToFileURL(path.resolve(process.cwd(), "dist/server/entry-server.js")).href;
    render = (await import(entryUrl)).render;
  }
  const rendered = await render(url, sync, api.request);
  return template.replace("<!--app-html-->", rendered.html).replace("<!--app-state-->", rendered.state);
}
