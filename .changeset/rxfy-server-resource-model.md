---
"rxfy-server": minor
---

`defineResource` now accepts an optional pre-made `model` (`defineResource({ table, model })`), binding a Drizzle table to an existing rxfy `ModelDescriptor` instead of deriving one — so a live resource can share a model with client code. The resource row type follows the injected model (the table may carry extra columns the model omits).
