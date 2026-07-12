---
"rxfy-client": major
"rxfy-react": minor
---

New `rxfy-client` package — the framework-agnostic browser half of the live stack. `createLiveClient`
moves out of `rxfy-react` into `rxfy-client` (the React package re-exports it, so existing imports
keep working); live updates no longer require React.

The client takes custody of the signed channel grants the data delivered — each `$grant` lifted by
`useStateData`, plus the SSR `grants` payload via the new `readSsrGrants()`. It subscribes with them
over the WebSocket transport, renews them ahead of expiry through an app-mounted endpoint
(`renewUrl`, which runs the app's own auth), and replays its whole grant set on every reconnect.

- `rxfy-client`: `createLiveClient({ registry, transport, renewUrl? })`, `readSsrGrants()`.
- `rxfy-react`: re-exports `createLiveClient` and `readSsrGrants`.
