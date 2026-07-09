# Live sessions

There are no grants and no client subscriptions. The server tracks what each browser session was
served and pushes updates for exactly that. The client's entire outbound protocol is one
`hello { session }` frame.

## Session identity

- SSR loads: `live.hydration(registry)` mints the session server-side and embeds it in the
  hydration payload; the client adopts it with `readSsrSession()`.
- CSR-only loads: the client mints its own id.

```ts
// src/session.ts
import { readSsrSession } from "rxfy-react";
export const sessionId = readSsrSession() ?? crypto.randomUUID();
```

Attach it to every API request and to the live client:

```ts
import { RXFY_SESSION_HEADER } from "rxfy-react";
const client = hc<AppType>("/api", { headers: { [RXFY_SESSION_HEADER]: sessionId } });

const liveClient = createLiveClient({ registry, transport: createWsClient({ url }), session: sessionId });
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
