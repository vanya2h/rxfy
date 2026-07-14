# Sync grants

The server records nothing at serve time — it **signs**. A read endpoint wraps its result in
`sync.serve`, which parses the payload and attaches a per-state JWT grant (claims: channel + the
served payload's entity topics + expiry) as a reserved `$grant` field on the returned data. The
client lifts `$grant` automatically inside `useStateData` — no session header, no fetch wrapping, no
integrator plumbing — sends a `subscribe` frame carrying just the grant, and renews grants before
they expire. Subscription state is socket-keyed on the server and dies with the socket.

## SECURITY — the grant is a precise capability

> The grant's claims name both the **channel** and the exact **entity topics** (`name:id`) the
> payload was served with. The WebSocket server subscribes a socket to only the channel + entities
> its grant enumerates — nothing the client asks for out of band — so a grant can watch exactly the
> rows it was served and no more. Entity ids therefore need not be unguessable; serial integer PKs
> are safe.
>
> **Still set `Cache-Control: private, no-store` on state endpoints.** A cached personalized response
> would leak a live _capability_ (the grant), not merely a data snapshot.
>
> For large payloads the grant grows with the entity count. It rides the data plane (smaller than the
> rows it accompanies) and, on reconnect, the same id list the subscribe frame always carried — enable
> WebSocket `permessage-deflate` in production.

A leaked grant is a capability until its `exp`: mitigate with short TTL, renewal behind the app's own
auth, and never putting grants in URLs. Rotating the secret invalidates all outstanding grants at
once — renewals then fail, clients degrade to static, and a refetch mints fresh grants.

## Grant custody

The grant is never something the integrator handles. `sync.serve` attaches it as `$grant`;
`useStateData` strips it before normalization and hands the grant straight to the sync client — the
entity topics ride inside the grant, so the client computes nothing. A payload without `$grant`
simply isn't live; a store-only app hits none of this. A consumer that ignores `$grant` (curl,
server-to-server) just sees one extra string field.

There is no session id, no `x-rxfy-session` header, and no fetch wrapper. The API client carries
nothing live-related — grants ride inside the response body.

## API client wiring

In the template and blog example the API client lives in a single `createApiClient` factory
(`src/api-client.tsx`) — the browser client is a plain `hc<AppType>("/api")` with no headers, the SSR
client goes in-process instead. No client module imports server code; the hono endpoints are the
single source of truth for reads and writes:

```tsx
import type { Hono } from "hono";
import { hc } from "hono/client";
import type { AppType } from "../server/api.js";

/** hono's in-process `app.request` — what the server entry injects for SSR. */
export type ApiFetch = Hono["request"];

export function createApiClient(serverFetch?: ApiFetch) {
  return serverFetch
    ? hc<AppType>("http://ssr.internal", { fetch: serverFetch }) // SSR: in-process, no network trip
    : hc<AppType>("/api"); // browser: plain network client, no headers
}
```

The sync client is created in `entry-client.tsx`; its `renewUrl` points at the app-mounted renewal
endpoint. No `session` option, no `sessionHeaders`:

```tsx
const syncClient = createSyncClient({
  registry,
  transport: createWsClient({ url }),
  renewUrl: "/api/live/renew",
});
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

## Serving = signing

A read endpoint wraps its result in `sync.serve(state, params, data)` — it parses the raw payload
(the state's _input_ shape: raw DB rows, unbranded ids, extra columns allowed) through the state's
schemas, signs a grant for `stateChannel(state, params)`, and returns the parsed shape (ids branded,
unknown keys stripped) with `$grant` attached. It never touches the hub — serving is stateless.
Raw Drizzle rows go in directly, no casts, no `req`:

```ts
.get("/todos", async (c) => {
  const rows = await db.select().from(todos);
  return c.json(sync.serve(todosState, {}, { todos: rows }));
})
```

Pass the SAME `params` you pass to `useStateData` — window keys are stripped internally, so the
signed channel always matches the one the client's `updatesAvailable$` counts.

SSR renders sign everything at once. `useStateData` logs each rendered state's channel into
`registry.channels` during SSR; `sync.hydration(registry)` signs one grant per logged channel and
embeds them in the hydration script as `grants: string[]`:

```ts
onAllReady() {
  // collect pipe into `html`, then:
  resolve({ html, state: sync.hydration(registry) });
}
```

On the client, `readSsrGrants()` (from `rxfy-client`) lifts those embedded grants so the sync client
can subscribe immediately, before any client-side fetch resolves.

The entry's `render` (typed by the shared `RenderFn` in `server/render-types.ts`) receives `live`
AND `apiFetch` (hono's in-process `app.request`) as parameters — in dev, Vite's SSR module graph is
separate from the server's, and the db/hub/api must be a single instance. `server/render.ts` calls
`render(url, live, api.request)`, and entry-server passes `apiFetch` to `createApiClient` so SSR
fetches hit the same endpoints in-process.

## Renewal

Grants expire (default TTL 15 min). The client runs one renewal timer; near expiry it POSTs the
expiring grants to `renewUrl` and re-subscribes with the reissued ones. The endpoint runs the app's
own auth and calls `sync.renew(grant)` per grant:

```ts
.post("/live/renew", async (c) => {
  const { grants } = await c.req.json<{ grants: string[] }>();
  return c.json({ grants: grants.map((g) => sync.renew(g)) });
})
```

`sync.renew` verifies each grant (accepting tokens expired within the grace window) and returns a
freshly-dated grant, or `null` when the signature is invalid or beyond grace. A denied renewal
(401, rotated secret) drops that entry — the state goes static, and recovery is a refetch that mints
a fresh grant.

## Lifecycle

- The client sends a `subscribe` frame (the grant alone; its claims carry the entities) as soon as it has a grant — from
  `readSsrGrants()` on an SSR load, or from the `$grant` lifted out of a client-side fetch. The WS
  server verifies the grant and subscribes that socket; fetch-before-connect is fine (the frame is
  replayed on open).
- On reconnect the client replays its whole grant set, so delivery resumes without any caller
  action. Updates published while disconnected are lost — the refresh badge / refetch is the
  recovery path.
- Subscription state is socket-keyed on the server and dies with the socket (`hub.drop(conn)` on
  close). There is no server-side TTL to expire.

## What stays manual

- `touch(channelDescriptor, params)` on writes — only the app knows which lists a write invalidates.
- One `sync.serve` per read endpoint — the server can't see what a plain Drizzle read served.
