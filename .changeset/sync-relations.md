---
"rxfy": minor
"rxfy-client": minor
---

Real-time sync for model relations. `createModel` accepts a type-safe `fk` map (`{ category: "categoryId" }`, both sides inferred from the schema) linking each relation to its foreign-key column; `sync.serve` now recurses joined relations so the signed grant enumerates nested entity topics (client-fetch and SSR) and the served payload keeps nested entities for the client to normalize; the client patch handler mirrors a relation's id from its `fk` column so a flat patch keeps the relation resolvable. New `registry.descriptor(name)` accessor. Additive — store-only and non-joined apps are unaffected.
