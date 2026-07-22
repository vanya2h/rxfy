---
"rxfy": patch
---

Tighten `createModel`'s `fk` map typing: on a model with no relations it now rejects all keys. Previously `FkMap` collapsed to `{}` for a relation-less model, silently accepting junk like `fk: { bogus: "col" }`. Models with relations are unchanged (`fk` still autocompletes and rejects unknown relation/column names).
