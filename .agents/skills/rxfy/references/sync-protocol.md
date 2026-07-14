# rxfy-protocol

The wire contract between `rxfy-server` and `rxfy-ws`. Only import it directly when building a custom transport (or a non-standard server that must speak the same wire format). All messages carry `v` (protocol version) and a `kind` discriminant.

## Messages

Server → client:

| Type           | `kind`    | Fields                            | Description                                                                                                                                           |
| -------------- | --------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PatchMessage` | `"patch"` | `v`, `kind`, `name`, `id`, `data` | Sync entity update. Holders of `name:id` apply it in place. `data` is opaque at the protocol layer; consumers validate it against their model schema. |
| `StaleMessage` | `"stale"` | `v`, `kind`, `channel`            | Structural change signal for a state channel. Clients increment a local staleness counter so they know to re-fetch.                                   |

Client → server:

| Type               | `kind`        | Fields               | Description                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SubscribeMessage` | `"subscribe"` | `v`, `kind`, `grant` | The client's ONLY outbound frame. `grant` is the signed JWT from a served payload (`$grant`) or the SSR `grants` array; its claims name the channel AND the `name:id` entity topics it authorizes. The server verifies the grant (signature + expiry) and subscribes the socket to that channel plus those entities. Replayed on every reconnect. |

Constructors stamp the current `PROTOCOL_VERSION` automatically:

```ts
import { patch, stale, subscribe } from "rxfy-protocol";

patch("user", "42", { name: "Alice" }); // PatchMessage
stale("posts:list"); // StaleMessage
subscribe(grant, ["posts:uuid-1", "posts:uuid-2"]); // SubscribeMessage
```

`ClientMessage = SubscribeMessage` — there is no hello or session frame. Subscriptions are written
server-side from the verified `subscribe` frame (see `sync-grants.md`).

## Codec

| Export                    | Purpose                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `serialize(message)`      | Encode any protocol message to a string via superjson — `Date`/`Map`/`Set`/`BigInt` survive the wire intact |
| `parseServerMessage(raw)` | Decode + validate a `ServerMessage` (`patch` \| `stale`) on the client                                      |
| `parseClientMessage(raw)` | Decode + validate a `ClientMessage` (`subscribe`) on the server                                             |
| `ProtocolError`           | Thrown on malformed input, wrong version, or unknown `kind`                                                 |

## Versioning

```ts
export const PROTOCOL_VERSION = 2;
```

The codec requires an exact `v` match — no negotiation, no backward-compatibility layer. A version bump means a coordinated upgrade of the server and all clients before traffic resumes.
