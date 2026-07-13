import { stale } from "rxfy-protocol";
import {
  channelSubscription,
  createGrantIssuer,
  createInMemoryHub,
  type Hub,
  type StateChannelDescriptor,
  touch,
} from "rxfy-server/hub";

// One hub per process. The custom server (server.mts) and the react-router server bundle each
// load their own copy of this module, so the instance is shared through globalThis — same trick
// the in-memory store uses.
const globalForHub = globalThis as unknown as { __rr7BlogHub?: Hub };
export const hub: Hub = (globalForHub.__rr7BlogHub ??= createInMemoryHub());

// HMAC secret for signing/verifying channel grants — shared with the WebSocket server (server.mts)
// so grants signed here verify there. Override via RXFY_SECRET in production.
// eslint-disable-next-line turbo/no-undeclared-env-vars
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

// The stateless grant half of the live server — `issuer.serve` signs a per-state grant (channel +
// the payload's entity topics) and attaches it as `$grant`; `issuer.renew` reissues one before
// expiry; `issuer.hydration` embeds the SSR grants. No hub interaction — the client presents the
// grant on its own subscribe frame, which the WebSocket server verifies against the same SECRET.
export const issuer = createGrantIssuer({ secret: SECRET, grantTtlMs: 15 * 60_000, renewGraceMs: 5 * 60_000 });

/** Mark a state channel stale — every socket subscribed to it via a live grant gets an update badge. */
export function touchState(state: StateChannelDescriptor, params: Record<string, unknown>): void {
  const { channel } = touch(state, params);
  hub.publish(channelSubscription(channel), stale(channel));
}
