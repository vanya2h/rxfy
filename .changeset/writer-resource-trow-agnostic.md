---
"rxfy-server": patch
---

`live.create` and `live.update` now accept `Resource<TTable, any>` instead of pinning `TRow` to the table's raw select model. Writers never touch `TRow` — values and the returned row are typed from the table — so resources carrying an injected model (branded ids, narrower row) no longer need an `as unknown as Resource<typeof table>` cast.
