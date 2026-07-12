---
"rxfy": patch
---

`defineState`'s `window` option (and `StateDescriptor.window`) is now typed as `readonly (keyof TParams & string)[]` instead of `readonly string[]`, so window entries must name declared params — a typo'd entry is a compile error instead of a silently ignored dimension.
