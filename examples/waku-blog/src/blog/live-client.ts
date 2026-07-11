import { createModelRegistry } from "rxfy";
import { createLiveClient } from "rxfy-client";
import { createWsClient } from "rxfy-ws/client";

/** waku owns its HTTP server, so the live WebSocket listens on a sibling port (see server/ws.ts). */
const WS_PORT = 8090;

/**
 * Browser-only live wiring, created once per page load: the shared model registry, the WebSocket
 * transport, and the live client that routes patch/stale messages into it. `undefined` during
 * SSR — the server render has no socket, and StoreProvider falls back to its own registry.
 */
export const live =
  typeof window === "undefined"
    ? undefined
    : (() => {
        const registry = createModelRegistry();
        const transport = createWsClient({
          url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${WS_PORT}/live`,
        });
        const liveClient = createLiveClient({ registry, transport });
        return { registry, transport, liveClient };
      })();
