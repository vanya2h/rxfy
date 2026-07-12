---
"rxfy-server": minor
---

New `grantsHydration(registry, { secret, ttlMs? })` helper, exported from `rxfy-server/hub`: the one-call SSR payload for apps on the bare hub (no `createServer`) — signs a channel grant for each channel the render logged into the registry and returns the hydration script with the `grants` embedded. `live.hydration` now wraps it. The client lifts the grants (`readSsrGrants`) and subscribes; entity topics ride the client's first subscribe frame, derived from the hydrated stores.
