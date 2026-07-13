import { createInMemoryHub, createLive, type Hub, type StateChannelDescriptor, touch } from "rxfy-server";
import { memoryStorage } from "rxfy-server-memory";

// One hub per process, shared across waku's bundles through globalThis — same trick the
// in-memory store uses.
const globalForHub = globalThis as unknown as { __wakuBlogHub?: Hub };
export const hub: Hub = (globalForHub.__wakuBlogHub ??= createInMemoryHub());

// HMAC secret for signing/verifying channel grants — shared with the WebSocket server (ws.ts) so
// grants signed here verify there. Override via RXFY_SECRET in production.
// eslint-disable-next-line turbo/no-undeclared-env-vars
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

// This app persists to its own in-memory store (src/server/store.ts), so it only drives the live
// server's grant half (serve/renew/hydration) plus `live.touch`; the in-memory storage adapter
// carries no collections here. An app that wrote entities would pass its `defineCollection`s to it.
export const live = createLive({ storage: memoryStorage(), hub, secret: SECRET });

/** Mark a state channel stale — every tab holding a grant for it gets a live update badge. */
export function touchState(state: StateChannelDescriptor, params: Record<string, unknown>): void {
  live.touch(touch(state, params));
}
