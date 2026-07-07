# Live client (rxfy-react)

Connects a WebSocket transport to a `ModelRegistry` so server pushes land in the normalized stores and per-state update counters tick up. Pass the result to `StoreProvider`'s `liveClient` prop; `useStateData` reads it automatically and surfaces `updatesAvailable$` / `applyUpdates` on every handle.

## createLiveClient

```ts
import { createLiveClient, readSsrGrants } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";

const liveClient = createLiveClient({
  registry,    // IModelRegistry — the same one passed to StoreProvider
  transport,   // LiveTransport — e.g. createWsClient() from rxfy-ws/client
  grants,      // Grants (optional) — topic/channel → subscription-id map
});
```

What it does:

- Calls `transport.onMessage` once. Inbound `"patch"` messages are applied directly to the named model store (`registry.namedStores().get(name)?.set(id, data)`); channel-invalidation messages increment the matching channel counter.
- Subscribes to `registry.added$` and calls `transport.subscribe` for each newly tracked entity whose topic id (`"<name>:<key>"`) is in the grants table — late-arriving entities are covered without extra wiring.
- Exposes `channel(name)` → `ChannelCounter` (`{ available$: Observable<number>, reset: () => void }`); `useStateData` calls it internally for each keyed state.
- Exposes `addGrants(grants)` for subscription ids received after boot, and `stop()` — unsubscribe all internal RxJS subscriptions and complete all counters (it does not send transport-level unsubscribes).

`grants` defaults to empty maps, but in practice always pass `grants: readSsrGrants()` so the client subscribes with server-issued ids immediately, without a round-trip (see `grants-hydration.md`).

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

Returns the `LiveClient` from the nearest `StoreProvider`, or `null` when no `liveClient` prop was provided. Escape hatch for custom transports or imperative `addGrants` calls — normally never called directly (`useStateData` does it).

## updatesAvailable$ / applyUpdates

Both come from the `StateHandle` returned by `useStateData`:

```ts
const { data$, updatesAvailable$, applyUpdates } = useStateData({
  state: postsState,
  fetchFn: fetchPosts,
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
