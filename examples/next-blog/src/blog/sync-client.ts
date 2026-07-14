import { createModelRegistry } from "rxfy";
import { createSyncClient } from "rxfy-client";
import { createWsClient } from "rxfy-ws/client";

/**
 * Browser-only sync wiring, created once per page load: the shared model registry, the WebSocket
 * transport, and the sync client that routes patch/stale messages into it. Grants lifted from the
 * served payloads (and any SSR grants in `__RXFY_SSR__`) subscribe on this socket; the renew route
 * reissues each grant before it expires so long-lived tabs keep receiving updates. `undefined`
 * during SSR — the server render has no socket, and StoreProvider falls back to its own registry.
 */
export const sync =
  typeof window === "undefined"
    ? undefined
    : (() => {
        const registry = createModelRegistry();
        const transport = createWsClient({
          url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`,
        });
        const syncClient = createSyncClient({ registry, transport, renewUrl: "/api/live/renew" });
        return { registry, transport, syncClient };
      })();
