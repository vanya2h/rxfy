<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../assets/rxfy-lockup-white.svg">
  <img alt="rxfy" src="../../assets/rxfy-lockup.svg" width="200">
</picture>

**rxfy** (/ɑɹ ɪks faɪ/) is a minimalistic framework that lets you declare typed models and the states that query them, then access their data as reactive observables. [Normalization](https://rxfy.vanya2h.me/core-concepts/normalization) keeps your app consistent and reactive at no extra cost.

rxfy is built on three principles:

- Every entity lives in one slot, keyed by its id; a write reaches every subscriber with no list re-fetch.
- Each slot is an RxJS Observable that components subscribe to directly.
- You declare the fetch shape, the model, and the mutations; rxfy normalizes the result, handles SSR, and rehydrates the client without a second fetch.

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
