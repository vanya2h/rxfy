# rxfy-client

The framework-agnostic browser live runtime for [rxfy](https://rxfy.vanya2h.me) — channel grant custody plus the live update sink. `rxfy-react` builds on this; use it directly from vanilla JS, Vue, Svelte, or any other view layer.

## Channel grants

There are no server-held sessions. Each served state payload carries a stateless signed JWT channel grant on a reserved
`$grant` field. The client takes custody of every grant, sends a `subscribe` frame carrying it plus the entity topics
its payload normalized into, and renews grants near expiry against an app-mounted endpoint.

- Grants arrive automatically: `useStateData` lifts `$grant` off each fetch result and hands it to the live client —
  zero integrator plumbing.
- `readSsrGrants(): string[]` — lifts the SSR `grants` array embedded in the hydration payload, for grants that came
  down with a server-rendered page.
- The API client is now plain `hc<AppType>("/api")` — no session headers, no fetch wrapping. Live subscriptions ride
  the `$grant` in the payload, so the fetch client carries nothing.

## Live client

`createLiveClient({ registry, transport, renewUrl? })` is a patch/stale sink plus grant custody: patches land in the
model stores in place, stales bump channel counters, and it manages the subscribe/renew/replay lifecycle for its
grants. Its only outbound frame is `subscribe`. Near expiry it POSTs the expiring grants to `renewUrl` and
re-subscribes with the reissued grants; omit `renewUrl` to let grants simply expire. On reconnect it replays its whole
grant set.

```ts
import { createLiveClient, readSsrGrants } from "rxfy-client";
import { createWsClient } from "rxfy-ws/client";

const live = createLiveClient({
  registry,
  transport: createWsClient({ url: `wss://${location.host}/live` }),
  renewUrl: "/api/live/renew",
});
```

See the [Live client docs](https://rxfy.vanya2h.me/react/live-client) and [Grants](https://rxfy.vanya2h.me/framework/server/grants).
