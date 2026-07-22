---
"rxfy": minor
---

Joined reads are now view-typed: `ModelStore.get` preserves the key's brand, so a `StoreKey` minted by a joined query shape (`single(Post).with({ author: true, comments: { author: true } })`) yields an entity whose joined relations are **required** — they read without a `!`. Thread those branded keys down to child components (instead of raw ids) and each `get` returns the matching view. A base `StoreKey<T>` still yields the base entity as before. Enabled by making the `StoreKey` phantom brand covariant, so a joined-view key is assignable wherever the base key is expected.
