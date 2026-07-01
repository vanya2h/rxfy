---
"rxfy-react": minor
---

Add the client live layer: `createLiveClient` (applies inbound entity patches to stores and counts per-state "updates available" signals), `stateChannel`, `readSsrGrants`, `StoreProvider`'s `liveClient` prop + `useLiveClient`, and `useStateData`'s `updatesAvailable$` / `applyUpdates()`.
