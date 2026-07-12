import {
  createInMemoryHub,
  createResourceRegistry,
  createServer,
  type Hub,
  type StateChannelDescriptor,
  touch,
} from "rxfy-server";

// One hub per process, shared across waku's bundles through globalThis — same trick the
// in-memory store uses.
const globalForHub = globalThis as unknown as { __wakuBlogHub?: Hub };
export const hub: Hub = (globalForHub.__wakuBlogHub ??= createInMemoryHub());

// HMAC secret for signing/verifying channel grants — shared with the WebSocket server (ws.ts) so
// grants signed here verify there. Override via RXFY_SECRET in production.
// eslint-disable-next-line turbo/no-undeclared-env-vars
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

// This app persists to the in-memory store (src/server/store.ts), not Drizzle, so the live server's
// DB-backed writers (create/update/delete) are never used — only serve/touch/renew run, and none of
// those read `db` or `resources`. Pass an empty resource registry and an inert db to satisfy the type.
export const live = createServer({
  db: undefined as never,
  resources: createResourceRegistry([]),
  hub,
  secret: SECRET,
});

/** Mark a state channel stale — every tab holding a grant for it gets a live update badge. */
export function touchState(state: StateChannelDescriptor, params: Record<string, unknown>): void {
  live.touch(touch(state, params));
}
