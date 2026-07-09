import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { createModelRegistry } from "rxfy";
import { createLiveClient, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { ApiProvider, createApiClient } from "./blog/api-client.js";
import { App } from "./App.js";

const registry = createModelRegistry();
const apiClient = createApiClient(); // browser client: network trip + live session header
// The session defaults to the SSR-adopted id; client-only loads get one assigned by the server.
const liveClient = createLiveClient({
  registry,
  transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
});

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider registry={registry} ssr liveClient={liveClient}>
      <ApiProvider client={apiClient}>
        <App url={location.pathname} />
      </ApiProvider>
    </StoreProvider>
  </StrictMode>,
);
