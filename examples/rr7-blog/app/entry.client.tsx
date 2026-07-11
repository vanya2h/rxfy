import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { createModelRegistry } from "rxfy";
import { createLiveClient, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { ApiProvider, createApiClient } from "./blog/api-client";

const registry = createModelRegistry();
// The session defaults to the SSR-adopted id from the hydration payload; the server pushes
// patch/stale messages for exactly what this session was served.
const liveClient = createLiveClient({
  registry,
  transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StoreProvider ssr registry={registry} liveClient={liveClient}>
        <ApiProvider client={createApiClient()}>
          <HydratedRouter />
        </ApiProvider>
      </StoreProvider>
    </StrictMode>,
  );
});
