---
"rxfy": major
---

`createModel` now requires `name` (and `ModelDescriptor.name` is non-optional). The name is the model's stable string identity for SSR dehydration and live topics, and making it mandatory removes every unnamed-model fallback path:

- `dehydrate` no longer skips stores (and the "model store holds data but has no name" dev warning is gone) — every store serializes.
- `modelTopic` no longer throws for unnamed models.
- The registry's `added$` covers every store; the "unnamed stores are skipped" carve-out is gone.
- Error messages always carry the real model name (no more `<unnamed>`).

Migration: add `name: "..."` to any `createModel` call that omitted it. Names must be unique per app — duplicates still trigger the registry's dev warning since their entities would mix in `dehydrate` output.
