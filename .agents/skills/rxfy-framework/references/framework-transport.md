# rxfy-ws

The default WebSocket transport. Two entry points: `rxfy-ws` (server adapter, wires into `rxfy-server`'s `Hub`) and `rxfy-ws/client` (browser). Both speak `rxfy-protocol`.

## Server

`createWsServer(hub)` returns `{ handleConnection(socket) }` — call `createWsServer` once at startup, `handleConnection` for every new socket. It bridges the `Hub` to WebSocket connections: a client identifies itself with a `hello` frame, and the hub routes pushes by session — there are no subscribe frames, subscriptions are written server-side by the serve path (`live.serve` / `live.hydration`).

```ts
type ServerSocket = {
  send: (data: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};
```

`ServerSocket` is structural — the `ws` package's `WebSocket` satisfies it directly. Frameworks that wrap the underlying socket (Hono, Bun) need a thin adapter. The Hono bridge pattern: an `EventEmitter` acts as the event bus, `handleConnection` receives a `ServerSocket` literal on open, and message/close events relay through the emitter.

```ts
// server/ws.ts
import { EventEmitter } from "node:events";
import type { UpgradeWebSocket } from "hono/ws";
import { createWsServer } from "rxfy-ws";
import { hub } from "./live.js";

const wsServer = createWsServer(hub);

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
```

## Client

```ts
import { createWsClient } from "rxfy-ws/client";

type WsClientOptions = {
  url: string;
  /** Defaults to the global `WebSocket`. Inject for Node or tests. */
  WebSocketImpl?: (url: string) => WebSocketLike;
  /** Delay before each reconnect attempt. Default: 1000 ms. */
  reconnectDelayMs?: number;
};

type ClientTransport = {
  /** Announce the session; automatically re-sent on every reconnect. */
  hello: (session: string) => void;
  /** Single-slot inbound handler — a later call replaces the previous one. */
  onMessage: (handler: (message: ServerMessage) => void) => void;
  close: () => void;
};

function createWsClient(options: WsClientOptions): ClientTransport;
```

Behaviors:

- Remembers the last `hello`ed session; on `"close"` it reconnects after `reconnectDelayMs` (default 1000 ms), and on `"open"` it re-sends the `hello` frame for that session — no caller-side re-announce needed.
- A `hello()` call made before the socket is `OPEN` is silently dropped for that connection attempt (nothing is buffered), but is remembered and sent on the next `"open"`.
- `onMessage` is single-slot: a later call replaces the previous handler.

`ClientTransport` is a plain interface — anything satisfying the three-method shape works (test mocks, custom reconnect policies, non-WebSocket channels); the wire format is defined by `rxfy-protocol`. The server binds a session on `hello` (see `createWsServer` above) — there is no subscribe-frame routing to replicate.
