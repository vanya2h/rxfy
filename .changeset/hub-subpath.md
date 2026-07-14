---
"rxfy-server": minor
---

New drizzle-free `rxfy-server/hub` subpath exporting the socket-keyed in-memory hub, subscription-id helpers (`entitySubscription`/`channelSubscription`/`entityTopicSubscription`), channel derivation (`touch`/`invalidationChannel`/`StateChannelDescriptor`), the grant primitives (`signGrant`/`verifyGrant`), and the one-call SSR helper `grantsHydration(registry, { secret })` (signs a grant per channel the render logged and returns the hydration script — `live.hydration` now wraps it). Apps that only need stale-notification plumbing — e.g. an in-memory store publishing `stale` on writes — can now wire live updates without installing the Drizzle peer dependencies behind the main entry. `touch`/`TouchTarget` moved to the state-channel module and the subscription-id helpers to the hub module (still re-exported from the main entry — no import changes needed).
