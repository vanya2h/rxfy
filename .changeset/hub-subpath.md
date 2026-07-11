---
"rxfy-server": minor
---

New drizzle-free `rxfy-server/hub` subpath exporting the in-memory hub, subscription-id helpers (`entitySubscription`/`channelSubscription`), and channel derivation (`touch`/`invalidationChannel`/`StateChannelDescriptor`), and the one-call SSR helper `hubHydration(hub, registry, extraIds?)` (mints a session, registers the render's channels, returns the hydration script — `live.hydration` now wraps it). Apps that only need stale-notification plumbing — e.g. an in-memory store publishing `stale` on writes — can now wire live updates without installing the Drizzle peer dependencies behind the main entry. `touch`/`TouchTarget` moved to the state-channel module and the subscription-id helpers to the hub module (still re-exported from the main entry — no import changes needed).
