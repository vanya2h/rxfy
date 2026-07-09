# rxfy-protocol

The wire protocol and codec for [rxfy](https://rxfy.vanya2h.me) live updates. You rarely import this directly — `rxfy-server` and `rxfy-ws` use it — but it defines the contract.

## Messages

- Server → client: `patch` (an entity changed), `stale` (a state channel was invalidated).
- Client → server: `hello` (announces the session id — the only client frame).

## Codec

- `serialize(message)` — encode to a string (via superjson, so `Date` etc. survive).
- `parseServerMessage(raw)` / `parseClientMessage(raw)` — validate and decode.
- `PROTOCOL_VERSION` — bumped on breaking wire changes.

See the [Live messages docs](https://rxfy.vanya2h.me/framework/server/messages).
