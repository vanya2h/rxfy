# Live client (rxfy-client)

Connects a WebSocket transport to a `ModelRegistry` so server pushes land in the normalized stores and per-state update counters tick up. Lives in `rxfy-client`, the framework-agnostic browser runtime (`rxfy-react` re-exports everything for back-compat — either import works). Pass the result to `StoreProvider`'s `liveClient` prop; `useStateData` reads it automatically and surfaces `updatesAvailable$` / `applyUpdates` on every handle.

## createLiveClient

```ts
import { createLiveClient } from "rxfy-client";
import { createWsClient } from "rxfy-ws/client";

const liveClient = createLiveClient({
  registry,          // IModelRegistry — the same one passed to StoreProvider
  transport,         // ClientTransport — e.g. createWsClient() from rxfy-ws/client
  renewUrl: "/api/live/renew", // optional — the app's grant-renewal endpoint; omit to let grants expire
  // renewLeadMs?: number — how long before exp to renew (optional)
});
```

It drives the grant lifecycle. What it does:

- Registers a `transport.onMessage` handler. Inbound `"patch"` messages are applied directly to the named model store (`registry.namedStores().get(name)?.set(id, data)`); `"stale"` messages increment the matching channel counter.
- Registers a `transport.onOpen` handler that replays every live entry's `subscribe` frame, so subscriptions re-establish after a reconnect with no caller action.
- On `readSsrGrants()` at startup and on each `$grant` lifted from a served payload, it records the entry and sends a `subscribe(grant)` frame via `transport.send` — the grant's claims already carry its entity topics, so nothing else is computed client-side.
- Runs one renewal timer: near a grant's expiry it POSTs the expiring grants to `renewUrl`, then re-subscribes with the reissued grants. A denied renewal (401, rotated secret) drops that entry — the state goes static until a refetch mints a fresh grant.
- Exposes `subscribe(grant)` — how `useStateData` hands it a freshly-lifted `$grant`.
- Exposes `channel(name)` → `ChannelCounter` (`{ available$: Observable<number>, reset: () => void }`); `useStateData` calls it internally for each keyed state.
- Exposes `stop()` — completes all channel counters and cancels the renewal timer.

There is no session id, no `getSessionId`, and no header on the API client. Live capability rides
entirely in the `$grant` fields of served payloads and the SSR `grants` array; `readSsrGrants()`
(from `rxfy-client`) lifts the latter (see `live-grants.md`).

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
const api = useApi(); // the typed client from context, see live-grants.md
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
