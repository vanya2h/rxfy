---
"rxfy": minor
---

Add `added$` — a stream of entities entering the store. `ModelStore.added$` emits a key the first time its entity becomes present (the first `set`; updates don't re-emit), and replays the keys already present to new subscribers. `IModelRegistry.added$` exposes the same signal across every named store as `{ name, key }`, replaying existing entities and following stores created later (unnamed stores are skipped). This lets a live-update layer subscribe to exactly what the client has loaded without each query wiring its ids in by hand.
