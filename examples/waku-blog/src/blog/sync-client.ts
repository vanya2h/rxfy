import { createModelRegistry } from "rxfy";
import { createSyncClient } from "rxfy-client";
import { createWsClient } from "rxfy-ws/client";

/** waku owns its HTTP server, so the sync WebSocket listens on a sibling port (see server/ws.ts). */
const WS_PORT = 8090;

/**
 * Browser-only sync wiring, created once per page load: the shared model registry, the WebSocket
 * transport, and the sync client that routes patch/stale messages into it. Grants lifted from
 * served payloads (via `$grant` on `defaultData` and client refetches) subscribe on this socket;
 * the renew route reissues each grant before it expires so long-lived tabs keep receiving updates.
 * `undefined` during SSR — the server render has no socket, and StoreProvider falls back to its own registry.
 */
export const sync =
  typeof window === "undefined"
    ? undefined
    : (() => {
        const registry = createModelRegistry();
        const transport = createWsClient({
          url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${WS_PORT}/live`,
        });
        // The WebSocket lives on a sibling port, but renew is a plain HTTP POST to the main app.
        const syncClient = createSyncClient({ registry, transport, renewUrl: "/api/live/renew" });
        return { registry, transport, syncClient };
      })();
