---
"rxfy": minor
---

Add `hydrationScript(state)` — returns the complete inline `<script>` tag that pushes a dehydrated snapshot onto `window.__RXFY_SSR__`, the queue `StoreProvider` drains automatically. Buffered and two-pass SSR setups no longer need a custom global or the `dehydratedState` prop; the prop remains for custom transports.
