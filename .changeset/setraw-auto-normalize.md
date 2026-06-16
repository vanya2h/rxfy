---
"rxfy": minor
"rxfy-react": minor
---

`useStateData`'s `setRaw` now accepts denormalized entity objects (or a mix of ids and entities) in model-field slots and normalizes them on write — appending a page no longer needs a manual `normalizeResult` call, and the "entity not loaded" footgun is gone. Object elements are written to their model stores (schema-validated in development); string ids pass through unchanged, so existing id-only `setRaw` calls are unaffected. The updater form still receives `prev` as ids, keeping appends O(page size).

Adds the `normalizeWritable` helper and the `WritableQueryShapeOf` type to `rxfy`.
