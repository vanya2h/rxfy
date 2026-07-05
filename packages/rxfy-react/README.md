<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../assets/rxfy-lockup-white.svg">
  <img alt="rxfy" src="../../assets/rxfy-lockup.svg" width="200">
</picture>

Official React bindings for [rxfy](../rxfy/README.md). Subscribe components to normalized entities; each renders the one shared copy and updates live.

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
npm install rxfy rxfy-react
# peer deps: rxjs zod lodash react react-dom @types/react
```

## Links

- [Getting Started](https://rxfy.vanya2h.me/getting-started) — `StoreProvider` setup
- [React Bindings](https://rxfy.vanya2h.me/react) — `useStateData` (remote fetch or local `initial`), `useStatePagedData`, `useModelStore`, `useAtom`, `usePending`, `<Pending>`
- [Server-Side Rendering](https://rxfy.vanya2h.me/ssr) — buffered, streaming (Next.js App Router), two-pass
- [rxfy](../rxfy/README.md) — core library

## Guides

- [Build a Todo app](https://rxfy.vanya2h.me/guides/todo-app)
- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)
- [Live updates over WebSockets](https://rxfy.vanya2h.me/guides/live-updates-websockets)

## License

[MIT](../../LICENSE)
