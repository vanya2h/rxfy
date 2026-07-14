# rxfy-client

## 3.0.0-rc.0

### Major Changes

- f4cf59f: Entity grants: the signed grant now names the exact entity topics it authorizes.

  `live.serve` extracts the served payload's `name:id` topics and signs them into the grant claims;
  the `subscribe` frame drops its `entities` field (the client forwards only the grant); the WS server
  subscribes to `channel + claims.entities` alone. Entity ids no longer need to be unguessable — a grant
  authorizes a fixed, signed set. SSR reuses the served grant verbatim (`grantsHydration` no longer signs;
  its `secret`/`ttlMs` options are removed). New `collectShapeTopics` export in `rxfy`.

- 7e4415e: New `rxfy-client` package — the framework-agnostic browser half of the sync stack — and a
  terminology change: the real-time "live" surface is now named **sync**.

  `createSyncClient` (formerly `createLiveClient`) moves out of `rxfy-react` into `rxfy-client`;
  `rxfy-react` re-exports it, so React apps still import from `rxfy-react`. Sync updates no longer
  require React. In `rxfy-react`, `StoreProvider`'s `liveClient` prop is now `syncClient` and
  `useLiveClient` is now `useSyncClient`.

  The client takes custody of the signed channel grants the data delivered — each `$grant` lifted by
  `useStateData`, plus the SSR `grants` payload via the new `readSsrGrants()`. It subscribes with them
  over the WebSocket transport, renews them ahead of expiry through an app-mounted endpoint
  (`renewUrl`, which runs the app's own auth), and replays its whole grant set on every reconnect.

  - `rxfy-client`: `createSyncClient({ registry, transport, renewUrl? })`, `readSsrGrants()`.
  - `rxfy-react`: re-exports `createSyncClient` and `readSsrGrants`; `syncClient` prop, `useSyncClient`.
  - **Breaking (rename):** `createLiveClient` → `createSyncClient`, `useLiveClient` → `useSyncClient`,
    `liveClient` prop → `syncClient`, and types `LiveClient` / `LiveClientConfig` / `LiveTransport` →
    `SyncClient` / `SyncClientConfig` / `SyncTransport`.

### Patch Changes

- Updated dependencies [f4cf59f]
- Updated dependencies [630ab6f]
- Updated dependencies [02995d1]
- Updated dependencies [9984591]
- Updated dependencies [02995d1]
- Updated dependencies [02995d1]
- Updated dependencies [02995d1]
- Updated dependencies [02995d1]
  - rxfy@3.0.0-rc.0
  - rxfy-protocol@3.0.0-rc.0
