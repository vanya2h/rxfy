<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../assets/rxfy-lockup-white.svg">
  <img alt="rxfy" src="../../assets/rxfy-lockup.svg" width="200">
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

## Install

```bash
npm install rxfy
# peer deps: rxjs zod lodash
```

## Links

- [Getting Started](https://rxfy.vanya2h.me/getting-started)
- [Model](https://rxfy.vanya2h.me/rxfy/create-model) — `createModel`, `array`, `single`
- [State](https://rxfy.vanya2h.me/rxfy/define-state) — `defineState`, plain value fields, mutations
- [Atom](https://rxfy.vanya2h.me/rxfy/create-atom) — `createAtom`
- [Lens](https://rxfy.vanya2h.me/rxfy/create-lens) — `createLens`, `keyLens`
- [Normalization](https://rxfy.vanya2h.me/core-concepts/normalization)
- [Server-Side Rendering](https://rxfy.vanya2h.me/core-concepts/ssr) — `dehydrate`, `hydrate`, `hydrationScript`
- [rxfy-react](../rxfy-react/README.md) — React bindings

## Guides

- [Build a Todo app](https://rxfy.vanya2h.me/guides/todo-app)
- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)
- [Live blog guide](https://rxfy.vanya2h.me/guides/live-blog)

## License

[MIT](../../LICENSE)
