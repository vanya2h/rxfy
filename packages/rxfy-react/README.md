# rxfy-react

Official React bindings for [rxfy](../rxfy/README.md). Subscribe components to normalized entities; each renders the one shared copy and updates live.

📚 **Documentation: [rxfy.vanya2h.me](https://rxfy.vanya2h.me)**

## Agent skills

```bash
npx skills add vanya2h/rxfy
```

Installs two skills for AI coding assistants — `rxfy` (core API, React hooks, mutations) and `rxfy-ssr` (SSR setup). See [Agent Skills](https://rxfy.vanya2h.me/agent-skills).

## Install

```bash
npm install rxfy rxfy-react
# peer deps: rxjs zod lodash react react-dom @types/react
```

## Links

- [Getting Started](https://rxfy.vanya2h.me/getting-started) — `StoreProvider` setup
- [React Bindings](https://rxfy.vanya2h.me/react) — `useStateData`, `useStatePagedData`, `useModelStore`, `useAtom`, `usePending`, `<Pending>`
- [Server-Side Rendering](https://rxfy.vanya2h.me/ssr) — buffered, streaming (Next.js App Router), two-pass
- [rxfy](../rxfy/README.md) — core library

## Guides

- [Build a Todo app](https://rxfy.vanya2h.me/guides/todo-app)
- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)
- [Live updates over WebSockets](https://rxfy.vanya2h.me/guides/live-updates-websockets)

## License

[MIT](../../LICENSE)
