import { hc } from "hono/client";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { createModelRegistry } from "rxfy";
import { createSyncClient, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import type { AppType } from "../server/api.js";
import { ApiProvider } from "./kanban/api-client.js";
import { App } from "./App.js";

const registry = createModelRegistry();
// Browser client: real network trip to the /api routes.
const apiClient = hc<AppType>("/api");
const syncClient = createSyncClient({
  registry,
  transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
  renewUrl: "/api/live/renew",
});

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider registry={registry} ssr syncClient={syncClient}>
      <ApiProvider client={apiClient}>
        <App />
      </ApiProvider>
    </StoreProvider>
  </StrictMode>,
);
