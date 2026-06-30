---
"rxfy-ws": minor
---

Add `rxfy-ws`: the default WebSocket transport. `createWsServer(hub)` bridges the rxfy-server hub to sockets; `rxfy-ws/client`'s `createWsClient` is a cross-platform client transport (subscribe/unsubscribe + inbound messages, with reconnect and subscription replay).
