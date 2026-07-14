---
"rxfy-client": major
"rxfy-react": major
---

New `rxfy-client` package — the framework-agnostic browser half of the sync stack — and a
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
