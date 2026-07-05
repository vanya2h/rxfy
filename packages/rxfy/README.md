<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../assets/rxfy-lockup-white.svg">
  <img alt="rxfy" src="../../assets/rxfy-lockup.svg" width="200">
</picture>

**rxfy** (/ɑɹ ɪks faɪ/) is a reactive data-flow layer for your UI: declare typed models, states, and [normalized stores](https://rxfy.vanya2h.me/core-concepts/normalization) as Observables, and scale from a client-only store to a fully live app with server-side rendering and real-time updates. It's built for consistency and granular reactivity at no extra cost.

rxfy is built on three principles:

- Every entity lives in a normalized store, accessed granularly by its id; an update reaches every subscriber automatically.
- Each page has its own state composed with the data from normalized stores; components are the granular consumers of that state — each updates only when the data it reads changes.
- States and stores are serializable: rxfy has first-class Server-Side Rendering (SSR) support.

[Why rxfy?](https://rxfy.vanya2h.me/why) explains the thinking behind this design.

📚 **Documentation: [rxfy.vanya2h.me](https://rxfy.vanya2h.me)**

## Agent skills

```bash
npx skills add vanya2h/rxfy
```

Installs two skills for AI coding assistants — `rxfy` (core API, React hooks, mutations) and `rxfy-ssr` (SSR setup). See [Agent Skills](https://rxfy.vanya2h.me/agent-skills).

## Install

```bash
npm install rxfy
# peer deps: rxjs zod lodash
```

## Links

- [Getting Started](https://rxfy.vanya2h.me/getting-started)
- [Model](https://rxfy.vanya2h.me/core-concepts/model) — `createModel`, `array`, `single`
- [State](https://rxfy.vanya2h.me/core-concepts/state) — `defineState`, plain value fields, mutations
- [Atom](https://rxfy.vanya2h.me/core-concepts/atom) — `createAtom`
- [Lens](https://rxfy.vanya2h.me/core-concepts/lens) — `createLens`, `keyLens`
- [Normalization](https://rxfy.vanya2h.me/core-concepts/normalization)
- [Server-Side Rendering](https://rxfy.vanya2h.me/ssr) — `dehydrate`, `hydrate`, `hydrationScript`
- [rxfy-react](../rxfy-react/README.md) — React bindings

## Guides

- [Build a Todo app](https://rxfy.vanya2h.me/guides/todo-app)
- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)
- [Live updates over WebSockets](https://rxfy.vanya2h.me/guides/live-updates-websockets)

## License

[MIT](../../LICENSE)
