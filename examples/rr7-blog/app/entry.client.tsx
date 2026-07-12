import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { createModelRegistry } from "rxfy";
import { createLiveClient, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";
import { ApiProvider, createApiClient } from "./blog/api-client";

const registry = createModelRegistry();
// Grants lifted from the SSR payload (__RXFY_SSR__) and from client-only fetches subscribe on this
// socket; the renew route reissues each grant before it expires so long-lived tabs keep receiving
// patch/stale updates.
const liveClient = createLiveClient({
  registry,
  transport: createWsClient({ url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live` }),
  renewUrl: "/api/live/renew",
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
