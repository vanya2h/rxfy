# rxfy-protocol

The wire contract between `rxfy-server` and `rxfy-ws`. Only import it directly when building a custom transport (or a non-standard server that must speak the same wire format). All messages carry `v` (protocol version) and a `kind` discriminant.

## Messages

Server → client:

| Type | `kind` | Fields | Description |
|---|---|---|---|
| `PatchMessage` | `"patch"` | `v`, `kind`, `name`, `id`, `data` | Live entity update. Holders of `name:id` apply it in place. `data` is opaque at the protocol layer; consumers validate it against their model schema. |
| `StaleMessage` | `"stale"` | `v`, `kind`, `channel` | Structural change signal for a state channel. Clients increment a local staleness counter so they know to re-fetch. |

Client → server:

| Type | `kind` | Fields | Description |
|---|---|---|---|
| `SubscribeMessage` | `"subscribe"` | `v`, `kind`, `ids` | Request live updates for the given entity ids (`string[]`). |
| `UnsubscribeMessage` | `"unsubscribe"` | `v`, `kind`, `ids` | Cancel subscriptions for the given entity ids (`string[]`). |

Constructors stamp the current `PROTOCOL_VERSION` automatically:

```ts
import { patch, stale, subscribe, unsubscribe } from "rxfy-protocol";

patch("user", "42", { name: "Alice" });   // PatchMessage
stale("posts:list");                       // StaleMessage
subscribe(["user:42", "post:7"]);          // SubscribeMessage
unsubscribe(["post:7"]);                   // UnsubscribeMessage
```

> In the standard stack the `ids` sent over the wire are the **opaque grant values** (HMAC topic ids from `live.grant` — see grants-hydration.md), never raw `"name:id"` topics; raw strings here are for illustration only.

## Codec

| Export | Purpose |
|---|---|
| `serialize(message)` | Encode any protocol message to a string via superjson — `Date`/`Map`/`Set`/`BigInt` survive the wire intact |
| `parseServerMessage(raw)` | Decode + validate a `ServerMessage` (`patch` \| `stale`) on the client |
| `parseClientMessage(raw)` | Decode + validate a `ClientMessage` (`subscribe` \| `unsubscribe`) on the server |
| `ProtocolError` | Thrown on malformed input, wrong version, or unknown `kind` |

## Versioning

```ts
export const PROTOCOL_VERSION = 1;
```

The codec requires an exact `v` match — no negotiation, no backward-compatibility layer. A version bump means a coordinated upgrade of the server and all clients before traffic resumes.
