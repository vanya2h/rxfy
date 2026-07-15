import { EventEmitter } from "node:events";
import type { UpgradeWebSocket } from "hono/ws";
import { createWsServer } from "rxfy-ws";
import { hub, SECRET } from "./sync.js";

const wsServer = createWsServer(hub, { secret: SECRET });

/** Register the `/live` WebSocket handler using a Hono app's upgradeWebSocket helper. */
export function liveRoute(upgradeWebSocket: UpgradeWebSocket) {
  return upgradeWebSocket(() => {
    const emitter = new EventEmitter();
    return {
      onOpen(_evt: Event, ws: { send: (data: string) => void }) {
        wsServer.handleConnection({
          send: (data: string) => ws.send(data),
          on: (event, cb) => emitter.on(event, cb),
        });
      },
      onMessage(evt: MessageEvent) {
        emitter.emit("message", evt.data);
      },
      onClose() {
        emitter.emit("close");
      },
    };
  });
}
