# Live client (rxfy-client)

Connects a WebSocket transport to a `ModelRegistry` so server pushes land in the normalized stores and per-state update counters tick up. Lives in `rxfy-client`, the framework-agnostic browser runtime (`rxfy-react` re-exports everything for back-compat — either import works). Pass the result to `StoreProvider`'s `liveClient` prop; `useStateData` reads it automatically and surfaces `updatesAvailable$` / `applyUpdates` on every handle.

## createLiveClient

```ts
import { createLiveClient } from "rxfy-client";
import { createWsClient } from "rxfy-ws/client";

const liveClient = createLiveClient({
  registry,   // IModelRegistry — the same one passed to StoreProvider
  transport,  // LiveTransport — e.g. createWsClient() from rxfy-ws/client
  // session?: string — override; defaults to getSessionId(), see live-sessions.md
});
```

It is a pure sink: there is nothing to subscribe, because the server already knows what this
session was served (via `live.serve` / `live.hydration`) and pushes updates for exactly that. What
it does:

- Calls `transport.hello(session ?? getSessionId())` once at construction — for an SSR load that carries the adopted id; for a client-only load it is a session-less hello asking the server to assign one.
- Calls `transport.onMessage` once. Inbound `"patch"` messages are applied directly to the named model store (`registry.namedStores().get(name)?.set(id, data)`); `"stale"` messages increment the matching channel counter; a `"session"` message installs the server-assigned id (`adoptSessionId`) and re-hellos with it so the transport replays it on reconnect.
- Exposes `channel(name)` → `ChannelCounter` (`{ available$: Observable<number>, reset: () => void }`); `useStateData` calls it internally for each keyed state.
- Exposes `stop()` — completes all channel counters (it does not send transport-level unsubscribes; there's nothing to unsubscribe from).

The client never mints a session id: `getSessionId()` is the SSR-adopted id or `undefined` until
the server assigns one over the WS. The same id reaches the API via `sessionHeaders` — wired
inside the template's `createApiClient` browser branch — or `withSession` for a non-hono fetch
layer (see `live-sessions.md`).

## StoreProvider `liveClient` prop

```tsx
import { StoreProvider } from "rxfy-react";

hydrateRoot(
  document.getElementById("root")!,
  <StoreProvider registry={registry} ssr liveClient={liveClient}>
    <App />
  </StoreProvider>,
);
```

Optional. When omitted, every `updatesAvailable$` emits `0` and `applyUpdates` falls back to a plain `reload()`.

## useLiveClient

```ts
const live = useLiveClient(); // LiveClient | null
```

Returns the `LiveClient` from the nearest `StoreProvider`, or `null` when no `liveClient` prop was provided. Escape hatch for custom transports or direct `channel(name)` access — normally never called directly (`useStateData` does it).

## updatesAvailable$ / applyUpdates

Both come from the `StateHandle` returned by `useStateData`:

```ts
const api = useApi(); // the typed client from context, see live-sessions.md
const { data$, updatesAvailable$, applyUpdates } = useStateData({
  state: postsState,
  fetchFn: async () => (await api.posts.$get()).json(),
  params: {},
});
```

- `updatesAvailable$: Observable<number>` — starts at `0`, increments on each `stale` message for this state's channel. Stays `0` with no live client.
- `applyUpdates()` — resets the counter to `0` and calls `reload()`.

```tsx
// UpdatesBadge.tsx (abbreviated)
const n = useObservable(available$, 0);
if (n <= 0) return null;
return <button onClick={onApply}>{n} new {noun}{n === 1 ? "" : "s"} · refresh</button>;

// PostList.tsx
<UpdatesBadge available$={handle.updatesAvailable$} onApply={handle.applyUpdates} noun="post" />
```

`applyUpdates` also works as the `onCreated` / `onDeleted` callback in mutation forms — local writes reset the counter and re-fetch in one step.

## patch vs stale on the client

- `patch` applies silently in place: the entity cell in the named store updates, the query's id list is untouched.
- `stale` never edits a list — it increments the counter so the UI can show a "N new — refresh" badge. In-place list edits would require the server to know every client's ordering/filter state.
