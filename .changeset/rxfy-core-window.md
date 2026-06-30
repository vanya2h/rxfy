---
"rxfy": minor
---

Add the optional `window` field to `defineState` (names the pagination/slice params excluded from a state's live invalidation channel), and carry live-update `grants` in the SSR hydration payload (`DehydratedState.grants`).
