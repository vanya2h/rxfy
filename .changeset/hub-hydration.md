---
"rxfy-server": minor
---

New `hubHydration(hub, registry, extraIds?)` helper, exported from both the main entry and `rxfy-server/hub`: the one-call SSR payload for apps on the bare hub (no `createServer`) — mints the render's session, subscribes it to the registry's logged channels (plus any `extraIds`), and returns the hydration script with the session embedded. `live.hydration` now wraps it, adding entity subscriptions for resource-backed models.
