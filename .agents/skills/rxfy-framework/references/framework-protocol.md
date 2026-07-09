# rxfy-protocol

The wire contract between `rxfy-server` and `rxfy-ws`. Only import it directly when building a custom transport (or a non-standard server that must speak the same wire format). All messages carry `v` (protocol version) and a `kind` discriminant.

## Messages

Server → client:

| Type | `kind` | Fields | Description |
|---|---|---|---|
| `PatchMessage` | `"patch"` | `v`, `kind`, `name`, `id`, `data` | Live entity update. Holders of `name:id` apply it in place. `data` is opaque at the protocol layer; consumers validate it against their model schema. |
| `StaleMessage` | `"stale"` | `v`, `kind`, `channel` | Structural change signal for a state channel. Clients increment a local staleness counter so they know to re-fetch. |
| `SessionMessage` | `"session"` | `v`, `kind`, `session` | Server-assigned session id, sent in reply to a session-less `hello` (client-only apps). The live client adopts it and re-hellos with it. |

Client → server:

| Type | `kind` | Fields | Description |
|---|---|---|---|
| `HelloMessage` | `"hello"` | `v`, `kind`, `session?` | Announce the session after every (re)connect. The client's ONLY outbound frame — subscriptions are written server-side by the serve path (`live.serve` / `live.hydration`), so there is nothing else for a client to say. Omitting `session` asks the server to mint one (answered with a `session` frame). |

Constructors stamp the current `PROTOCOL_VERSION` automatically:

```ts
import { hello, patch, session, stale } from "rxfy-protocol";

patch("user", "42", { name: "Alice" });   // PatchMessage
stale("posts:list");                       // StaleMessage
hello("a1b2c3-session-id");                // HelloMessage (hello() → session-less, ask-to-assign)
session("a1b2c3-session-id");              // SessionMessage
```

There is no subscribe/unsubscribe frame — a session's subscriptions are entirely a server-side
concern (see `live-sessions.md`).

## Codec

| Export | Purpose |
|---|---|
| `serialize(message)` | Encode any protocol message to a string via superjson — `Date`/`Map`/`Set`/`BigInt` survive the wire intact |
| `parseServerMessage(raw)` | Decode + validate a `ServerMessage` (`patch` \| `stale` \| `session`) on the client |
| `parseClientMessage(raw)` | Decode + validate a `ClientMessage` (`hello`) on the server |
| `ProtocolError` | Thrown on malformed input, wrong version, or unknown `kind` |
| `RXFY_SESSION_HEADER` | `"x-rxfy-session"` — the HTTP header carrying the session id, matched to the WebSocket `hello`. Re-exported from `rxfy-client`, whose `sessionHeaders()` / `withSession()` build the header for you (see `live-sessions.md`) |

## Versioning

```ts
export const PROTOCOL_VERSION = 2;
```

The codec requires an exact `v` match — no negotiation, no backward-compatibility layer. A version bump means a coordinated upgrade of the server and all clients before traffic resumes.
