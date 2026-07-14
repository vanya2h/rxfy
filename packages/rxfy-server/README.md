# rxfy-server

Storage-agnostic server-side live data for [rxfy](https://rxfy.vanya2h.me). Write through the sync server, publish sync updates to subscribers, and sign the grants clients subscribe with — over a pluggable storage adapter.

## Install

```bash
npm install rxfy-server
# peer deps: rxfy zod
# plus a storage adapter: rxfy-server-drizzle (Postgres) or rxfy-server-memory (in-memory)
```

## What it gives you

- `createSync({ storage, hub, secret })` — the sync server. `secret` is the HMAC key for signing/verifying grants; `storage` is a `SyncStorage` adapter. Exposes `live.create` / `live.update` / `live.delete` that persist through the adapter and publish `patch` / `stale` messages, plus `live.renew` to reissue an expiring grant. Generic over the adapter's binding, so it accepts only that adapter's resources.
- `SyncStorage<TBinding>` — the persistence port implemented by adapters ([rxfy-server-drizzle](https://www.npmjs.com/package/rxfy-server-drizzle), [rxfy-server-memory](https://www.npmjs.com/package/rxfy-server-memory)). `Resource<TInsert, TRow, TBinding>` is the storage-neutral resource each adapter's `defineResource` / `defineCollection` produces.
- `createResourceRegistry` — a neutral, typed index of resources (optional; `createSync` does not require it).
- `createInMemoryHub` — socket-keyed pub/sub routing that pushes `patch` / `stale` messages to the sockets subscribed on verified grant frames.
- `live.serve` — a read-endpoint pass-through: parses the payload, signs a per-state grant (its claims name the channel **and** the entity topics served), and attaches it as `$grant`. Stateless — no hub interaction, no requester session.
- `live.hydration` — the one-call SSR payload: dehydrate the registry and embed the grants the render logged as `grants: string[]`.
- `signGrant` / `verifyGrant` — the HS256 grant primitives (the WebSocket transport verifies with the same `secret`).

See the [rxfy-server docs](https://rxfy.vanya2h.me/framework/server) for the full walkthrough, and [Storage adapters](https://rxfy.vanya2h.me/framework/server/storage-adapters) for picking a `SyncStorage`.
