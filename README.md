# rxfy

**rxfy** (/ɑɹ ɪks faɪ/) is a small library that lets you declare typed models and the states that query them, then access their data as reactive observables. [Normalization](https://rxfy.vanya2h.me/normalization) keeps your app consistent and reactive at no extra cost.

rxfy is built on three principles. Every entity lives in one slot, keyed by its id; a write reaches every subscriber with no list re-fetch. Each slot is an RxJS Observable that components subscribe to directly. You declare the fetch shape, the model, and the mutations; rxfy normalizes the result, handles SSR, and rehydrates the client without a second fetch. [Why rxfy?](https://rxfy.vanya2h.me/why) explains the thinking behind this design.

📚 **Documentation: [rxfy.vanya2h.me](https://rxfy.vanya2h.me)**

## Agent skills

```bash
npx skills add vanya2h/rxfy
```

Installs two skills for AI coding assistants — `rxfy` (core API, React hooks, mutations) and `rxfy-ssr` (SSR setup). See [Agent Skills](https://rxfy.vanya2h.me/agent-skills).

## Packages

| Package | Purpose |
|---|---|
| [`rxfy`](packages/rxfy) | Core library: Atom, Lens, Wrapped, Models/States API, SSR dehydrate/hydrate |
| [`rxfy-react`](packages/rxfy-react) | Official React bindings (`rxfy-react/next` for Next.js App Router) |

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

- [Model](https://rxfy.vanya2h.me/core-concepts/model)
- [State](https://rxfy.vanya2h.me/core-concepts/state)
- [Atom](https://rxfy.vanya2h.me/core-concepts/atom)
- [Lens](https://rxfy.vanya2h.me/core-concepts/lens)
- [Normalization](https://rxfy.vanya2h.me/normalization)

**API Reference**

- [React Bindings](https://rxfy.vanya2h.me/react)
- [Server-Side Rendering](https://rxfy.vanya2h.me/ssr)
- [rxfy package README](packages/rxfy/README.md)
- [rxfy-react package README](packages/rxfy-react/README.md)

**Guides**

- [Build a Todo app](https://rxfy.vanya2h.me/guides/todo-app)
- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)
- [Live updates over WebSockets](https://rxfy.vanya2h.me/guides/live-updates-websockets)
- [Examples](https://rxfy.vanya2h.me/examples)

**Examples**

- [vite-todo](examples/vite-todo) — Todo app with Vite SSR
- [vite-realtime-todos](examples/vite-realtime-todos) — normalized state driven by WebSocket server-push (Vite SSR · Hono · Drizzle SQLite)
- [next-blog](examples/next-blog) — Next.js App Router with streaming SSR

## License

[MIT](LICENSE)
