import { hc } from "hono/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { StoreProvider } from "rxfy-react";
import type { AppType } from "../server/api.ts";
import { ApiProvider } from "./api-client.tsx";
import App from "./App.tsx";
// index.css is linked from index.html (render-blocking) so it's in the SSR <head> — no FOUC.

// Hydration state arrives via the server-injected window.__RXFY_SSR__ script —
// StoreProvider ingests it automatically. The browser api client goes over HTTP to /api.
hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider ssr>
      <ApiProvider client={hc<AppType>("/api")}>
        <App />
      </ApiProvider>
    </StoreProvider>
  </StrictMode>,
);
