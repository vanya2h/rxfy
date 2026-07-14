---
"rxfy-server": major
---

Writer signatures tightened. `Live.update`/`Live.create` infer the resource's `TRow` instead of erasing it with `Resource<TTable, any>`, so resources carrying an injected (branded / narrower) model fit as before. `Live.create` no longer types `undefined` in its result — a plain insert always returns the row (a zero-row `.returning()` now throws). `Live.update` resolving `undefined` is now the documented not-found contract, and a not-found update no longer publishes its `touch` targets.
