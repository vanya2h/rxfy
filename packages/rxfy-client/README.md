# rxfy-client

The framework-agnostic browser live runtime for [rxfy](https://rxfy.vanya2h.me) — session identity plus the live update sink. `rxfy-react` builds on this; use it directly from vanilla JS, Vue, Svelte, or any other view layer.

## Session identity

Every page load has a live session id: the server pushes updates for everything it serves that session. Minting is
always the server's job — SSR loads embed the id in the hydration payload; client-only loads get one assigned over the
WebSocket (a session-less `hello` is answered with a `session` frame).

- `getSessionId()` — the SSR-adopted id, or `undefined` until the server assigns one; never minted client-side.
- `sessionHeaders()` — `{ "x-rxfy-session": <id> }` to spread into any HTTP client's default headers; `{}` while the
  session is unknown (such requests are served, just not recorded for live updates).
- `withSession(fetchFn?)` — wraps any fetch-compatible function so every request carries the session header once known.
- `readSsrSession()` — the raw SSR payload read, if you need it directly.

```ts
import { getSessionId, sessionHeaders, withSession } from "rxfy-client";

const apiFetch = withSession(); // every request carries the session header
const client = hc<AppType>("/api", { headers: sessionHeaders }); // or: hono, axios, ky defaults
```

## Live client

`createLiveClient({ registry, transport, session? })` is a pure sink: patches land in the model stores in place, stales
bump channel counters. Its entire outbound protocol is one `hello` frame. `session` defaults to `getSessionId()`; when
that is `undefined` (client-only load) the server assigns an id via a `session` frame, which the client adopts and
re-hellos.

```ts
import { createLiveClient } from "rxfy-client";
import { createWsClient } from "rxfy-ws/client";

const live = createLiveClient({
  registry,
  transport: createWsClient({ url: `wss://${location.host}/live` }),
});
```

See the [Live client docs](https://rxfy.vanya2h.me/react/live-client) and [Sessions](https://rxfy.vanya2h.me/framework/server/sessions).
