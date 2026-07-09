---
"rxfy": minor
"rxfy-protocol": minor
"rxfy-ws": minor
"rxfy-server": minor
"rxfy-react": minor
---

Session-based live updates — the grant flow is removed end to end.

The server now tracks what each browser session was served and pushes updates for it; clients no
longer subscribe to anything (their only outbound frame is `hello { session }`).

- `rxfy`: new `stateChannel` (canonical channel derivation), `ChannelLog`/`registry.channels`;
  the hydration payload carries `session` instead of `grants`.
- `rxfy-protocol`: protocol v2 — `hello` replaces `subscribe`/`unsubscribe`; new
  `RXFY_SESSION_HEADER`.
- `rxfy-ws`: the server binds sessions on `hello`; the client transport is `{ hello, onMessage, close }`
  and replays the hello on reconnect.
- `rxfy-server`: `live.serve(req, state, params, data)` pass-through and `live.hydration(registry)`
  register subscriptions; the hub is session-keyed with a bind/release TTL; `grant`, `GrantSpec`,
  `Grants`, and `createTopicKeyer` are removed.
- `rxfy-react`: `createLiveClient({ registry, transport, session })` is a pure sink;
  `readSsrSession` replaces `readSsrGrants`; `addGrants` is removed; `useStateData` records SSR
  channels on the registry.
