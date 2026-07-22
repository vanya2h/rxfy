<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../assets/rxfy-lockup-white.svg">
  <img alt="rxfy" src="../../assets/rxfy-lockup.svg" width="200">
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
# getting rxfy into a project (template or add-to-existing-app)
npx skills add vanya2h/rxfy --skill rxfy-setup

# working in a project that already has rxfy
npx skills add vanya2h/rxfy --skill rxfy
```

Two agent skills for AI coding assistants: `rxfy-setup` (scaffold a `create-rxfy-app` template or add rxfy to an existing app at a chosen depth) and `rxfy` (a task-indexed reference library for the whole framework — store, React, SSR, real-time sync). Setup records the chosen variant so usage never re-detects the project type. See [Agent Skills](https://rxfy.vanya2h.me/agent-skills).

## Install

```bash
npm install rxfy
# peer deps: rxjs zod lodash
```

## Links

- [Getting Started](https://rxfy.vanya2h.me/getting-started)
- [Model](https://rxfy.vanya2h.me/rxfy/create-model) — `createModel`, `array`, `single`, relations (`ref`/`refArray` + `fk`), `StoreKey`/`asKey`
- [State](https://rxfy.vanya2h.me/rxfy/define-state) — `defineState`, per-state joins (`.with`/`join`), plain value fields, mutations
- [Atom](https://rxfy.vanya2h.me/rxfy/create-atom) — `createAtom`
- [Lens](https://rxfy.vanya2h.me/rxfy/create-lens) — `createLens`, `keyLens`
- [Observables](https://rxfy.vanya2h.me/core-concepts/observables) — the value-over-time model behind `Atom` and `data$`
- [Normalization](https://rxfy.vanya2h.me/core-concepts/normalization)
- [Server-Side Rendering](https://rxfy.vanya2h.me/core-concepts/ssr) — `dehydrate`, `hydrate`, `hydrationScript`
- [rxfy-react](../rxfy-react/README.md) — React bindings

## Guides

- [Pagination and infinite scroll](https://rxfy.vanya2h.me/guides/pagination)

## License

[MIT](../../LICENSE)
