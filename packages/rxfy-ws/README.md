# rxfy-ws

The default WebSocket transport for [rxfy](https://rxfy.vanya2h.me) live updates. Bridges a `rxfy-server` hub to WebSocket connections on the server, and rxfy stores to a socket on the client.

## Install

```bash
npm install rxfy-ws
# server peer dep: rxfy-server, ws
```

## API

- `createWsServer(hub)` — returns `{ handleConnection(socket) }`; wire it to your WS server's connection handler.
- `createWsClient({ url })` — returns a transport with `subscribe` / `unsubscribe` / `onMessage` / `close`, auto-reconnecting and re-subscribing.

Works with the Node `ws` package or the browser `WebSocket`. See the [rxfy-ws docs](https://rxfy.vanya2h.me/framework/ws).
