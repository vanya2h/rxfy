# rxfy

Core library for typed, normalized, reactive state. Define models and states; rxfy splits each fetch result into shared entity stores plus an id-only query shape. Every entity lives in one slot — a write reaches every subscriber with no list re-fetch.

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
- [State](https://rxfy.vanya2h.me/core-concepts/state) — `defineState`, mutations
- [Atom](https://rxfy.vanya2h.me/core-concepts/atom) — `createAtom`
- [Lens](https://rxfy.vanya2h.me/core-concepts/lens) — `createLens`, `keyLens`
- [Normalization](https://rxfy.vanya2h.me/normalization)
- [Server-Side Rendering](https://rxfy.vanya2h.me/ssr) — `dehydrate`, `hydrate`, `hydrationScript`
- [rxfy-react](../rxfy-react/README.md) — React bindings

## Guides

- [Build a Todo app](https://rxfy.vanya2h.me/guides/todo-app)
- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)
- [Live updates over WebSockets](https://rxfy.vanya2h.me/guides/live-updates-websockets)

## License

[MIT](../../LICENSE)
