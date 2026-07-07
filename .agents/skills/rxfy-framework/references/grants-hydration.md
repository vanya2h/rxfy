# Grants & live hydration

Every entity topic (`posts:42`) and state channel (`posts:author=7`) is a capability — clients cannot self-issue subscriptions, or any user could watch data they are not permitted to see. Instead the server mints a signed allow-list (grants) from the rendered registry during SSR: only topics and channels actually fetched during the render are grantable. The tokens are tied to a rotating key (see `createTopicKeyer` in `framework-server.md`).

## Server side

Call `live.grant(registry, { entities, states })` AFTER `onAllReady` — the registry must be fully populated. Spread the result into `hydrationScript` alongside the dehydrated state:

```tsx
// entry-server.tsx
import { dehydrate, hydrationScript } from "rxfy";
import { live } from "../server/live.js";
import { commentResource, postResource, userResource } from "./blog/resources.js";
import { matchRoute, routeStates } from "./routes.js";

onAllReady() {
  // collect pipe to `html` string, then:
  const grants = live.grant(registry, {
    entities: [postResource, userResource, commentResource],
    states: routeStates(route),   // Array<{ state: StateChannelDescriptor; params: Record<string, unknown> }>
  });
  resolve({ html, state: hydrationScript({ ...dehydrate(registry), grants }) });
}
```

Grants shape: `{ entities: Record<string, string>, channels: Record<string, string> }` — a topic-or-channel → hashed-key lookup the client uses when opening subscriptions.

## Client side

`readSsrGrants()` merges `grants` from all SSR hydration chunks (last-writer-wins per key; returns `{ entities: {}, channels: {} }` when none exist). Pass the result to `createLiveClient`, and the client to `StoreProvider`:

```tsx
// entry-client.tsx
import { createModelRegistry } from "rxfy";
import { createLiveClient, readSsrGrants, StoreProvider } from "rxfy-react";
import { createWsClient } from "rxfy-ws/client";

const registry = createModelRegistry();
const liveClient = createLiveClient({
  registry,
  transport: createWsClient({
    url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`,
  }),
  grants: readSsrGrants(),
});

hydrateRoot(
  document.getElementById("root")!,
  <StoreProvider registry={registry} ssr liveClient={liveClient}>
    <App url={location.pathname} />
  </StoreProvider>,
);
```

## State channels

`invalidationChannel(state, params)` derives the channel name for a state instance — pure and deterministic, identical on client and server:

```ts
export type StateChannelDescriptor = {
  key: string;
  window?: readonly string[];   // params excluded from the channel (pagination dims)
};

function invalidationChannel(
  state: StateChannelDescriptor,
  params: Record<string, unknown>,
): string;
```

Window dimensions (`page`, `cursor`, `sort`, …) listed in `state.window` are stripped before building the channel, so every window of the same partition shares one channel — a `stale` on `posts:author=7` reaches clients on any page of that author's list.

Key rule: pass the SAME `params` object you passed to `useStateData` to `live.grant`'s `states` — window keys are stripped internally, so the channel in the grant and the channel the client derives always agree.
