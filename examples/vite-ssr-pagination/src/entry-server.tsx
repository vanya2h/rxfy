import { hc } from "hono/client";
import { StrictMode } from "react";
import { renderToPipeableStream, type RenderToPipeableStreamOptions } from "react-dom/server";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import type { AppType } from "../server/api.ts";
import { type ApiFetch, ApiProvider } from "./api-client.tsx";
import App from "./App.tsx";

// `_url` is unused — this example renders one route with no URL-derived params, but the
// server passes it so the signature matches the template's `render(url, apiFetch, options)`.
export function render(_url: string, apiFetch: ApiFetch, options?: RenderToPipeableStreamOptions) {
  const registry = createModelRegistry(); // one per request
  // SSR data fetching goes through the server's own endpoints, in-process.
  const apiClient = hc<AppType>("http://ssr.internal", { fetch: apiFetch });
  const stream = renderToPipeableStream(
    <StrictMode>
      <StoreProvider registry={registry} ssr>
        <ApiProvider client={apiClient}>
          <App />
        </ApiProvider>
      </StoreProvider>
    </StrictMode>,
    options,
  );

  // Call after the React stream finishes — serializes everything fetched during render
  // into a <script> that pushes onto window.__RXFY_SSR__.
  return {
    ...stream,
    getState: () => hydrationScript(dehydrate(registry)),
  };
}
