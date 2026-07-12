import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { createModelRegistry } from "rxfy";
import { createLiveClient, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { ApiProvider, createApiClient } from "./blog/api-client.js";
import { App } from "./App.js";

const registry = createModelRegistry();
const apiClient = createApiClient(); // browser client: real network trip
// Grants lifted from the SSR payload (and from client-only fetches) subscribe on this socket; the
// renew route reissues each grant before it expires so long-lived tabs keep receiving updates.
const liveClient = createLiveClient({
  registry,
  transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
  renewUrl: "/api/live/renew",
});

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider registry={registry} ssr liveClient={liveClient}>
      <ApiProvider client={apiClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ApiProvider>
    </StoreProvider>
  </StrictMode>,
);
