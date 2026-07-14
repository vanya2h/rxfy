# rxfy-protocol

## 3.0.0-rc.0

### Major Changes

- f4cf59f: Entity grants: the signed grant now names the exact entity topics it authorizes.

  `live.serve` extracts the served payload's `name:id` topics and signs them into the grant claims;
  the `subscribe` frame drops its `entities` field (the client forwards only the grant); the WS server
  subscribes to `channel + claims.entities` alone. Entity ids no longer need to be unguessable — a grant
  authorizes a fixed, signed set. SSR reuses the served grant verbatim (`grantsHydration` no longer signs;
  its `secret`/`ttlMs` options are removed). New `collectShapeTopics` export in `rxfy`.

- 630ab6f: Automatic live subscriptions via signed channel grants — the declared-grant flow is removed.

  `live.serve(state, params, data)` signs a per-state JWT grant (channel + expiry) and attaches it
  to the parsed payload as `$grant`; `useStateData` lifts it automatically and subscribes with the
  payload's entity topics. Nothing to declare, no keyer, no fetch-client wiring.

  - `rxfy`: hydration payload carries `grants: string[]`; new `collectEntityTopics`.
  - `rxfy-protocol`: v2 — `subscribe { grant, entities }` is the only client frame; hashed-token
    subscribe/unsubscribe frames are gone.
  - `rxfy-server`: `createServer` requires `secret`; `serve` returns the parsed shape + `$grant`;
    new `renew`; hub is socket-keyed with grant expiry; `createTopicKeyer`, `grant`, `GrantSpec`,
    `Grants` are removed.
  - `rxfy-ws`: the server verifies grants on `subscribe`; the client transport is `send`/`onOpen`.
  - `rxfy-react`: `useStateData` lifts `$grant`; `addGrants` and grant props are removed.

  SECURITY: the grant authorizes both the channel and the exact entity topics it was signed for (see
  the entity-grants changeset), so entity ids need not be unguessable. Keep `Cache-Control: private,
no-store` on state endpoints as ordinary response hygiene (the payload carries a bearer grant).

## 2.0.0

### Minor Changes

- 5029f3c: Add `rxfy-protocol`: the standalone, zero-dependency wire contract for rxfy sync updates — `ServerMessage`/`ClientMessage` types, `PROTOCOL_VERSION`, message constructors, and `serialize`/`parseServerMessage`/`parseClientMessage` codec.

## 2.0.0-rc.2

## 2.0.0-rc.0

### Minor Changes

- 5029f3c: Add `rxfy-protocol`: the standalone, zero-dependency wire contract for rxfy sync updates — `ServerMessage`/`ClientMessage` types, `PROTOCOL_VERSION`, message constructors, and `serialize`/`parseServerMessage`/`parseClientMessage` codec.
