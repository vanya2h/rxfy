import { StrictMode } from "react";
import { renderToPipeableStream, type RenderToPipeableStreamOptions } from "react-dom/server";
import { createModelRegistry, dehydrate, hydrationScript } from "rxfy";
import { StoreProvider } from "rxfy-react";
import App from "./App.tsx";

export function render(_url: string, options?: RenderToPipeableStreamOptions) {
  const registry = createModelRegistry(); // one per request
  const stream = renderToPipeableStream(
    <StrictMode>
      <StoreProvider registry={registry} ssr>
        <App />
      </StoreProvider>
    </StrictMode>,
    options,
  );

  // Call after the React stream finishes — serializes everything fetched during render
  // into a <script> that pushes onto window.__RXFY_SSR__.
  return { ...stream, getState: () => hydrationScript(dehydrate(registry)) };
}
