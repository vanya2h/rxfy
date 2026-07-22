<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../assets/rxfy-lockup-white.svg">
  <img alt="rxfy" src="../../assets/rxfy-lockup.svg" width="200">
</picture>

Official React bindings for [rxfy](../rxfy/README.md). Subscribe components to normalized entities; each renders the one shared copy and updates live.

📚 **Documentation: [rxfy.vanya2h.me](https://rxfy.vanya2h.me)**

## Agent skills

```bash
# getting rxfy into a project (template or add-to-existing-app)
npx skills add vanya2h/rxfy --skill rxfy-setup

# working in a project that already has rxfy
npx skills add vanya2h/rxfy --skill rxfy
```

Two agent skills for AI coding assistants: `rxfy-setup` (scaffold a `create-rxfy-app` template or add rxfy to an existing app at a chosen depth) and `rxfy` (a task-indexed reference library for the whole framework — store, React, SSR, real-time sync). Setup records the chosen variant so usage never re-detects the project type. See [Agent Skills](https://rxfy.vanya2h.me/agent-skills).

## Install

```bash
npm install rxfy rxfy-react
# peer deps: rxjs zod lodash react react-dom @types/react
```

## Links

- [Getting Started](https://rxfy.vanya2h.me/getting-started) — `StoreProvider` setup
- [rxfy-react](https://rxfy.vanya2h.me/react) — `useStateData` (remote fetch or local `initial`), `useStatePagedData`, `useModelStore`, `useModelStoreValue`, `useAtom`, `usePending`, `<Pending>`
- [Sync Client (React)](https://rxfy.vanya2h.me/react/sync-client) — `createSyncClient`, `StoreProvider`'s `syncClient` prop, `useStateData`'s `updatesAvailable$` / `applyUpdates()`; `createSyncClient` and `readSsrGrants` are re-exported from their framework-agnostic home, [`rxfy-client`](https://rxfy.vanya2h.me/framework/client)
- [Server-Side Rendering](https://rxfy.vanya2h.me/core-concepts/ssr) — buffered, streaming (Next.js App Router), two-pass
- [rxfy](../rxfy/README.md) — core library

## Guides

- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)

## License

[MIT](../../LICENSE)
