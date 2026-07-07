<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/rxfy-lockup-white.svg">
  <img alt="rxfy" src="assets/rxfy-lockup.svg" width="200">
</picture>

**rxfy** (/ɑɹ ɪks faɪ/) is a reactive data-flow layer for your UI: declare typed models, states, and [normalized stores](https://rxfy.vanya2h.me/core-concepts/normalization) as Observables, and scale from a client-only store to a fully live app with server-side rendering and real-time updates. It's built for consistency and granular reactivity at no extra cost.

rxfy is built on four principles:

- Every entity lives in a normalized store, accessed granularly by its id; an update reaches every subscriber automatically.
- Each page has its own state composed with the data from normalized stores; components are the granular consumers of that state — each updates only when the data it reads changes.
- Values unwrap late: data travels through the app still wrapped as Observables, only the leaf component that renders a value unwraps it, and a write to the store never unwraps anything.
- States and stores are serializable: rxfy has first-class Server-Side Rendering (SSR) support.

[Why rxfy?](https://rxfy.vanya2h.me/why) explains the thinking behind this design.

📚 **Documentation: [rxfy.vanya2h.me](https://rxfy.vanya2h.me)**

## Agent skills

```bash
# client-only store setup
npx skills add vanya2h/rxfy --skill rxfy

# live-app (framework) setup
npx skills add vanya2h/rxfy --skill rxfy-framework
```

Installs one of two agent skills for AI coding assistants — `rxfy` (store + React + SSR) or `rxfy-framework` (everything in `rxfy` plus the real-time layer). Install the one matching your setup — never both. See [Agent Skills](https://rxfy.vanya2h.me/agent-skills).

## Packages

| Package                                   | Purpose                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| [`rxfy`](packages/rxfy)                   | Core library: Atom, Lens, Wrapped, Models/States API, SSR dehydrate/hydrate |
| [`rxfy-react`](packages/rxfy-react)       | Official React bindings (`rxfy-react/next` for Next.js App Router)          |
| [`rxfy-server`](packages/rxfy-server)     | Server-side live data: Drizzle resources, write + publish, grants           |
| [`rxfy-protocol`](packages/rxfy-protocol) | Wire protocol and codec for live updates                                    |
| [`rxfy-ws`](packages/rxfy-ws)             | Default WebSocket transport (client + server)                               |

## Install

```bash
npm install rxfy rxfy-react
# peer deps: rxjs zod lodash react react-dom @types/react
```

## Links

**Documentation**

- [Introduction](https://rxfy.vanya2h.me) — overview and quick taste
- [Why rxfy?](https://rxfy.vanya2h.me/why)
- [Getting Started](https://rxfy.vanya2h.me/getting-started)
- [Agent Skills](https://rxfy.vanya2h.me/agent-skills)
- [Comparison](https://rxfy.vanya2h.me/comparison)

**Core Concepts**

- [Normalization](https://rxfy.vanya2h.me/core-concepts/normalization)
- [Server-Side Rendering](https://rxfy.vanya2h.me/core-concepts/ssr)

**API Reference**

- [rxfy](https://rxfy.vanya2h.me/rxfy) — `createAtom`, `createLens`, `createModel`, `defineState`
- [React Bindings](https://rxfy.vanya2h.me/react)
- [rxfy-server](https://rxfy.vanya2h.me/framework/server)
- [rxfy-ws](https://rxfy.vanya2h.me/framework/ws)
- [rxfy package README](packages/rxfy/README.md)
- [rxfy-react package README](packages/rxfy-react/README.md)

**Guides**

- [Build a Todo app](https://rxfy.vanya2h.me/guides/todo-app)
- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)
- [Live blog](https://rxfy.vanya2h.me/guides/live-blog)
- [Examples](https://rxfy.vanya2h.me/examples)

**Examples**

- [vite-todo](examples/vite-todo) — Todo app with Vite SSR
- [vite-blog-framework](examples/vite-blog-framework) — live blog: SSR + WebSocket patches/stale, HMAC grants (Vite · Hono · PGlite · Drizzle · rxfy-server · rxfy-ws)
- [vite-ssr-pagination](examples/vite-ssr-pagination) — infinite paginated list with a switch between Load-more button and infinite scroll; streaming SSR; rows generated on demand with faker
- [next-blog](examples/next-blog) — Next.js App Router with streaming SSR
- [rr7-blog](examples/rr7-blog) — React Router 7 (framework mode) with buffered SSR; rxfy as the single data layer, loaders for routing only
- [waku-blog](examples/waku-blog) — Waku (minimal RSC framework); static home + dynamic post, server-component prefetch + prop hydration (no injection seam)

## License

[MIT](LICENSE)
