import { createInMemoryHub, createLive, type Hub, type StateChannelDescriptor, touch } from "rxfy-server";
import { memoryStorage } from "rxfy-server-memory";

// One hub per process. The custom server (server.mts) and the react-router server bundle each
// load their own copy of this module, so the instance is shared through globalThis — same trick
// the in-memory store uses.
const globalForHub = globalThis as unknown as { __rr7BlogHub?: Hub };
export const hub: Hub = (globalForHub.__rr7BlogHub ??= createInMemoryHub());

// HMAC secret for signing/verifying channel grants — shared with the WebSocket server (server.mts)
// so grants signed here verify there. Override via RXFY_SECRET in production.
// eslint-disable-next-line turbo/no-undeclared-env-vars
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

// The live server on the in-memory storage adapter. This app persists reads/comment-writes through
// its own store (store.ts) and only drives the live server's grant half (`live.serve` / `live.renew`
// / `live.hydration`) plus `live.touch` for stale badges — so `memoryStorage()` carries no
// collections here; an app that wrote entities would pass its `defineCollection`s through it.
export const live = createLive({
  storage: memoryStorage(),
  hub,
  secret: SECRET,
  grantTtlMs: 15 * 60_000,
  renewGraceMs: 5 * 60_000,
});

/** Mark a state channel stale — every socket subscribed to it via a live grant gets an update badge. */
export function touchState(state: StateChannelDescriptor, params: Record<string, unknown>): void {
  live.touch(touch(state, params));
}
