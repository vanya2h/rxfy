---
"rxfy": patch
"rxfy-react": patch
---

Add `modelTopic` and `createSubscriptionManager` for live-update integrations.

`modelTopic(model, id)` constructs a branded `Topic` string (`name:id`) from a named `ModelDescriptor`, replacing the copy-paste `topic()` helper from the live-updates guide.

`createSubscriptionManager(send)` is a transport-agnostic subscription reconciler — tracks `desired` vs `active` topic sets and sends only the gap to the server, with `reconnect()` to replay the full desired set after a connection drop.

Both are exported from the main `rxfy` barrel.
