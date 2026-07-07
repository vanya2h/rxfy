---
"rxfy-server": minor
---

Add the `rxfy-server/browser` subpath exporting the browser-safe resource API (`defineResource`, `createResourceRegistry`, `invalidationChannel` + types) without the Node-only `node:crypto` topic keyer — so `defineResource` can be imported into client bundles.
