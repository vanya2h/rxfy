---
"rxfy": minor
"rxfy-react": minor
---

`defineState` now requires `key`, and `StateDescriptor.key` is a required `string`. Every state participates in the SSR query cache and derives a live invalidation channel; the keyless opt-out is gone. Keyed descriptors are now directly assignable to key-requiring inputs such as rxfy-server's `StateChannelDescriptor`, so `touch(postsState, params)` works without a cast. `useStateData` drops the keyless code paths (private per-mount query atom and the SSR "cannot be fetched" warning). A `_shape` phantom carrier was added to `StateDescriptor` so `TShape` is structurally inferable from a descriptor value.

Migration: add a unique `key` to any `defineState` call that omitted one.
