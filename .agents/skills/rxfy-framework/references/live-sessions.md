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

Attach it to every API request; the live client picks it up by default. In the template and blog
example this lives inside a single `createApiClient` factory (`src/api-client.tsx`) — the browser
client carries the header, the SSR client goes in-process instead; no client module imports server
code, the hono endpoints are the single source of truth for reads and writes:

```tsx
import type { Hono } from "hono";
import { hc } from "hono/client";
import { sessionHeaders } from "rxfy-client";
import type { AppType } from "../server/api.js";

/** hono's in-process `app.request` — what the server entry injects for SSR. */
export type ApiFetch = Hono["request"];

// sessionHeaders() returns { "x-rxfy-session": <id> }, or {} while the id is unknown;
// hono's hc accepts it as a lazy headers function.
export function createApiClient(serverFetch?: ApiFetch) {
  return serverFetch
    ? hc<AppType>("http://ssr.internal", { fetch: serverFetch }) // SSR: in-process, no network trip
    : hc<AppType>("/api", { headers: sessionHeaders }); // browser: network trip + session header
}

// session defaults to getSessionId() — no need to pass it
const liveClient = createLiveClient({ registry, transport: createWsClient({ url }) });
```

Wiring: the SSR contract is the shared `RenderFn` type in `server/render-types.ts`
(`(url, live, apiFetch: Hono["request"]) => Promise<{ html, state }>`); the entry implements
`export const render: RenderFn = (url, live, apiFetch) => {...}` (params inferred), and
`server/render.ts` calls `render(url, live, api.request)` — hono's `request` is a bound class-field
arrow, safe to detach. entry-server calls `createApiClient(apiFetch)`, entry-client calls
`createApiClient()`, and both wrap the app in `<ApiProvider client={apiClient}>`. `useApi()` takes
NO arguments and returns the typed client from context — there is no selector/callback form and no
per-use-case wrapper layer; components call endpoints directly, for reads and writes alike
(`useStateData` intentionally ignores `fetchFn` identity, so inline async arrows are fine):

```tsx
const api = useApi();
const { data$, updatesAvailable$, applyUpdates } = useStateData({
  state: todosState,
  fetchFn: async () => (await api.todos.$get()).json(),
  params: {},
});
void api.todos.$post({ json: { title: next } }).then(() => applyUpdates());
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

The entry's `render` (typed by the shared `RenderFn` in `server/render-types.ts`) receives `live`
AND `apiFetch` (hono's in-process `app.request`) as parameters — in dev, Vite's SSR module graph is
separate from the server's, and the db/hub/api (the hub holds subscription state) must be a single
instance. `server/render.ts` calls `render(url, live, api.request)`, and entry-server passes
`apiFetch` to `createApiClient` so SSR fetches hit the same endpoints in-process.

## Lifecycle

- Pushes flow once the WS `hello` binds the session; fetch-before-connect is fine (the hub record
  waits).
- Reconnect re-hellos and delivery resumes; updates published while disconnected are lost — the
  refresh badge / refetch is the recovery path.
- Sessions with no bound socket expire after the hub's `ttlMs` (default 5 min).

## What stays manual

- `touch(channelDescriptor, params)` on writes — only the app knows which lists a write invalidates.
- One `live.serve` per read endpoint — the server can't see what a plain Drizzle read served.
