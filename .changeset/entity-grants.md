---
"rxfy": major
"rxfy-protocol": major
"rxfy-server": major
"rxfy-client": major
"rxfy-ws": major
"rxfy-react": major
---

Entity grants: the signed grant now names the exact entity topics it authorizes.

`live.serve` extracts the served payload's `name:id` topics and signs them into the grant claims;
the `subscribe` frame drops its `entities` field (the client forwards only the grant); the WS server
subscribes to `channel + claims.entities` alone. Entity ids no longer need to be unguessable — a grant
authorizes a fixed, signed set. SSR reuses the served grant verbatim (`grantsHydration` no longer signs;
its `secret`/`ttlMs` options are removed). New `collectShapeTopics` export in `rxfy`.
