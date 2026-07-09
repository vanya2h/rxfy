# Live sessions

There are no grants and no client subscriptions. The server tracks what each browser session was
served and pushes updates for exactly that. The client's entire outbound protocol is one `hello`
frame — carrying the session id when known, or session-less to ask the server to assign one.

## Session identity

`getSessionId(): string | undefined` from `rxfy-client` (re-exported by `rxfy-react`) is the one
source of truth. The client NEVER mints a session id — minting is always the server's job, reached
by one of two paths:

- SSR loads: `live.hydration(registry)` mints the session server-side and embeds it in the
  hydration payload; `getSessionId()` adopts it on the client.
- Client-only loads: the live client sends a session-less `hello`; the server mints an id and
  answers with a `session` frame; the live client adopts it and re-hellos so the transport replays
  the assigned id on reconnect. Until that frame arrives, `getSessionId()` returns `undefined`.

It is memoized per page load. Any "minted lazily on first call" model is obsolete.

Attach it to every API request; the live client picks it up by default:

```ts
import { sessionHeaders } from "rxfy-client";

// sessionHeaders() returns { "x-rxfy-session": <id> }, or {} while the id is unknown;
// hono's hc accepts it as a lazy headers function
const client = hc<AppType>("/api", { headers: sessionHeaders });

// session defaults to getSessionId() — no need to pass it
const liveClient = createLiveClient({ registry, transport: createWsClient({ url }) });
```

A headerless request is served normally, just not recorded for live updates. In client-only apps
this means fetches racing ahead of the WS session assignment go unrecorded — refresh/refetch
recovers, because the re-served read registers under the assigned session.

For a non-hono fetch layer, `withSession(fetchFn?)` wraps any fetch-compatible function so every
request carries the header once the session is known (pure pass-through before that) — defaults to
the ambient `fetch`:

```ts
import { withSession } from "rxfy-client";
const apiFetch = withSession(); // or withSession(myFetch)
```

## Serving = subscribing

A read endpoint wraps its result in `live.serve` — a pass-through that returns the data unchanged
and registers the served entities + state channel under the requester's session:

```ts
.get("/todos", async (c) => {
  const rows = await db.select().from(todos);
  return c.json(live.serve(c.req.raw, todosState, {}, { todos: rows }));
})
```

Pass the SAME `params` you pass to `useStateData` — window keys are stripped internally, so the
registered channel always matches the one the client's `updatesAvailable$` counts.

SSR renders register everything at once (`useStateData` logs each rendered state's channel into
`registry.channels` during SSR; entities come from the render registry):

```ts
onAllReady() {
  // collect pipe into `html`, then:
  resolve({ html, state: live.hydration(registry) });
}
```

`render` should receive `live` as a parameter from the server entry — in dev, Vite's SSR module
graph is separate from the server's, and the hub (which now holds subscription state) must be a
single instance.

## Lifecycle

- Pushes flow once the WS `hello` binds the session; fetch-before-connect is fine (the hub record
  waits).
- Reconnect re-hellos and delivery resumes; updates published while disconnected are lost — the
  refresh badge / refetch is the recovery path.
- Sessions with no bound socket expire after the hub's `ttlMs` (default 5 min).

## What stays manual

- `touch(channelDescriptor, params)` on writes — only the app knows which lists a write invalidates.
- One `live.serve` per read endpoint — the server can't see what a plain Drizzle read served.
