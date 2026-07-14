<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/rxfy-lockup-white.svg">
  <img alt="rxfy" src="assets/rxfy-lockup.svg" width="200">
</picture>

**rxfy** (/ɑɹ ɪks faɪ/) is a reactive data-flow layer for your React app: declare typed models, states, and [normalized stores](https://rxfy.vanya2h.me/core-concepts/normalization), and scale from a client-only store to a fully live app with server-side rendering and real-time updates via websockets. It's built for consistency and granular RxJS-based reactivity at no extra cost.

Keeping every view of your data in agreement is a difficult exercise. Doing it across many connected clients, in real time, is even harder. Update one entity and the list, the sidebar counter, and the search results all have to show its latest version; the usual fixes — refetch the list, patch the cache in place, invalidate caches by hand — are workarounds for one root cause: your app holds multiple copies of the same entity.

rxfy removes the copies. Each entity is stored **once**, in a normalized and composable store keyed by its id; states hold only references by id, and components subscribe to the exact entities they render, so one write reaches every subscriber. The server serializes the filled stores and the client restores them, which makes SSR first-class. With websockets on top, the write crosses the network too: the server persists it and publishes it to every connected client.

rxfy is built on four principles:

- **Every entity lives in one normalized store**, in a single slot keyed by its id. Writing to the slot is the only write path — you can't fork a copy — so an update reaches every subscriber automatically.
- **Each page declares its own state over those stores.** The state carries only ids, and each component re-renders only when the entity it reads changes, nothing else.
- **Values unwrap as late as possible**: data travels wrapped, only the leaf component that renders a value unwraps it, and a write never unwraps anything — see [Late Unwrapping](https://rxfy.vanya2h.me/core-concepts/late-unwrapping).
- **States and stores are serializable**: [SSR](https://rxfy.vanya2h.me/core-concepts/ssr) is first-class and works with frameworks like Next.js or React Router v7.

rxfy doesn't invent a reactivity system — it's built on [RxJS](https://rxjs.dev). An Atom **is** an `Observable` with synchronous `get()` and `set()`, so the whole operator library works on your app state, delivery is push-based and granular, and a websocket push is just another stream flowing into the same stores.

📚 **Documentation: [rxfy.vanya2h.me](https://rxfy.vanya2h.me)**

## Agent skills

```bash
# client-only store setup
npx skills add vanya2h/rxfy --skill rxfy

# sync app (framework) setup
npx skills add vanya2h/rxfy --skill rxfy-framework
```

Installs one of two agent skills for AI coding assistants — `rxfy` (store + React + SSR) or `rxfy-framework` (everything in `rxfy` plus the real-time layer). Install the one matching your setup — never both. See [Agent Skills](https://rxfy.vanya2h.me/agent-skills).

## Packages

| Package                                               | Purpose                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| [`rxfy`](packages/rxfy)                               | Core library: Atom, Lens, Wrapped, Models/States API, SSR dehydrate/hydrate |
| [`rxfy-react`](packages/rxfy-react)                   | Official React bindings (`rxfy-react/next` for Next.js App Router)          |
| [`rxfy-server`](packages/rxfy-server)                 | Storage-agnostic sync server: write + publish, signed grants                |
| [`rxfy-server-drizzle`](packages/rxfy-server-drizzle) | Drizzle/Postgres storage adapter (`defineResource`, `drizzleStorage`)       |
| [`rxfy-server-memory`](packages/rxfy-server-memory)   | In-memory storage adapter (`defineCollection`, `memoryStorage`)             |
| [`rxfy-client`](packages/rxfy-client)                 | Framework-agnostic browser sync runtime: grant custody, renewal, replay     |
| [`rxfy-protocol`](packages/rxfy-protocol)             | Wire protocol and codec for sync updates                                    |
| [`rxfy-ws`](packages/rxfy-ws)                         | Default WebSocket transport (client + server)                               |

## Install

```bash
npm install rxfy rxfy-react
# peer deps: rxjs zod lodash react react-dom @types/react
```

## Links

**Documentation**

- [Introduction](https://rxfy.vanya2h.me) — overview, the thinking behind the design, and a quick taste
- [Getting Started](https://rxfy.vanya2h.me/getting-started)
- [Agent Skills](https://rxfy.vanya2h.me/agent-skills)
- [Comparison](https://rxfy.vanya2h.me/comparison)

**Core Concepts**

- [Observables](https://rxfy.vanya2h.me/core-concepts/observables)
- [Normalization](https://rxfy.vanya2h.me/core-concepts/normalization)
- [Late Unwrapping](https://rxfy.vanya2h.me/core-concepts/late-unwrapping)
- [Server-Side Rendering](https://rxfy.vanya2h.me/core-concepts/ssr)

**API Reference**

- [rxfy](https://rxfy.vanya2h.me/rxfy) — `createAtom`, `createLens`, `createModel`, `defineState`
- [rxfy-react](https://rxfy.vanya2h.me/react)
- [rxfy-client](https://rxfy.vanya2h.me/framework/client) — `createSyncClient`, `readSsrGrants`
- [rxfy-server](https://rxfy.vanya2h.me/framework/server) — including [storage adapters](https://rxfy.vanya2h.me/framework/server/storage-adapters)
- [rxfy-ws](https://rxfy.vanya2h.me/framework/ws)
- [rxfy package README](packages/rxfy/README.md)
- [rxfy-react package README](packages/rxfy-react/README.md)

**Guides**

- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)
- [Examples](https://rxfy.vanya2h.me/examples)

**Examples**

- [vite-blog-framework](examples/vite-blog-framework) — live blog: SSR + WebSocket patches/stale, HMAC grants (Vite · Hono · PGlite · Drizzle · rxfy-server · rxfy-ws)
- [vite-ssr-pagination](examples/vite-ssr-pagination) — infinite paginated list with a switch between Load-more button and infinite scroll; streaming SSR; rows generated on demand with faker
- [next-blog](examples/next-blog) — Next.js App Router with streaming SSR
- [rr7-blog](examples/rr7-blog) — React Router 7 (framework mode) with buffered SSR; rxfy as the single data layer, loaders for routing only
- [waku-blog](examples/waku-blog) — Waku (minimal RSC framework); static home + dynamic post, server-component prefetch + prop hydration (no injection seam)

## License

[MIT](LICENSE)
