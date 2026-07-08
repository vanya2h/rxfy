import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { createModelRegistry } from "rxfy";
import { createLiveClient, readSsrGrants, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { App } from "./App.js";
import { setLiveClient } from "./live-singleton.js";

const registry = createModelRegistry();
const liveClient = createLiveClient({
  registry,
  transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
  grants: readSsrGrants(),
});
setLiveClient(liveClient);

hydrateRoot(
  document.getElementById("root") as HTMLElement,
  <StrictMode>
    <StoreProvider registry={registry} ssr liveClient={liveClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StoreProvider>
  </StrictMode>,
);
