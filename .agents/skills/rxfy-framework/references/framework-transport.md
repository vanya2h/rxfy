# rxfy-ws

The default WebSocket transport. Two entry points: `rxfy-ws` (server adapter, wires into `rxfy-server`'s `Hub`) and `rxfy-ws/client` (browser). Both speak `rxfy-protocol`.

## Server

`createWsServer(hub, { secret })` returns `{ handleConnection(socket) }` — call `createWsServer` once at startup, `handleConnection` for every new socket. `secret` is REQUIRED and MUST match the one passed to `createLive`. It bridges the `Hub` to WebSocket connections: on each `subscribe` frame it verifies the grant (signature + expiry) against `secret` and, on success, subscribes the socket to the channel plus the entity topics the grant's own claims enumerate (`hub.subscribe(conn, ids, exp)`) — the frame carries only the grant, so a client cannot ask for a topic its grant does not authorize; a frame whose grant fails verification is dropped silently (the client's renewal / refetch is the recovery path). There are no hello or session frames and no session binding. When the socket closes, `handleConnection` calls `hub.drop(conn)`, releasing every subscription it held.

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
import { hub, SECRET } from "./live.js";

const wsServer = createWsServer(hub, { secret: SECRET });

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
  /** Send a client frame (a `subscribe` message); dropped silently while disconnected. */
  send: (message: ClientMessage) => void;
  /** Single-slot inbound handler — a later call replaces the previous one. */
  onMessage: (handler: (message: ServerMessage) => void) => void;
  /** Fires on every (re)connect — the live client uses it to replay its grant set. */
  onOpen: (handler: () => void) => void;
  close: () => void;
};

function createWsClient(options: WsClientOptions): ClientTransport;
```

Behaviors:

- There is no `hello` or session frame. The transport is a plain conduit: `send` puts a
  `subscribe` message on the wire, `onMessage` receives `patch`/`stale`.
- On `"close"` it reconnects after `reconnectDelayMs` (default 1000 ms) and fires the `onOpen`
  handler on `"open"`. The live client's `onOpen` handler replays its full grant set (one
  `subscribe` frame per live entry), so subscriptions re-establish with no caller action.
- A `send` call made before the socket is `OPEN` is silently dropped for that connection attempt
  (nothing is buffered); the live client recovers by re-sending everything on the next `onOpen`.
- `onMessage` is single-slot: a later call replaces the previous handler.

`ClientTransport` is a plain interface — anything satisfying the four-method shape works (test mocks, custom reconnect policies, non-WebSocket channels); the wire format is defined by `rxfy-protocol`. The server subscribes a socket from each verified `subscribe` frame (see `createWsServer` above).
