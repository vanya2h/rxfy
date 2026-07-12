---
"rxfy": major
"rxfy-protocol": major
"rxfy-ws": major
"rxfy-server": major
"rxfy-react": major
---

Automatic live subscriptions via signed channel grants — the declared-grant flow is removed.

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

SECURITY: entity patches fan out on raw `name:id` topics gated by a valid grant — entity ids MUST
be unguessable (UUIDs, not serial integers) in live-enabled apps.
