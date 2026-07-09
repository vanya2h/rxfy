---
"rxfy-client": minor
"rxfy-react": minor
"rxfy-protocol": minor
"rxfy-ws": minor
---

New `rxfy-client` package — the framework-agnostic browser half of the live stack — and
server-assigned sessions for client-only apps.

`createLiveClient` and `readSsrSession` move out of `rxfy-react` into `rxfy-client` (the React
package re-exports both, so existing imports keep working). Live updates no longer require React.

Session identity is always minted by the server. SSR loads embed it in the hydration payload;
client-only loads send a session-less `hello` and the server answers with a new `session` frame
carrying the assigned id.

- `rxfy-client`: `getSessionId()` (SSR-adopted id, or `undefined` until the server assigns one),
  `sessionHeaders()` (`{ "x-rxfy-session": <id> }`, empty until known), and `withSession(fetchFn?)`
  (wraps any fetch so requests carry the header once known). `createLiveClient`'s `session` config
  is now optional — it defaults to `getSessionId()` and adopts a server-assigned id, re-helloing so
  reconnects replay it.
- `rxfy-protocol`: `hello.session` is optional (omitting it asks the server to assign one); new
  server frame `session` + constructor.
- `rxfy-ws`: the server mints a session on a session-less hello and replies with the `session`
  frame; the client transport accepts `hello()` and replays the latest hello on reconnect.
