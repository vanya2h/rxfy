import { stale } from "rxfy-protocol";
import {
  channelSubscription,
  createGrantIssuer,
  createInMemoryHub,
  type Hub,
  invalidationChannel,
  type StateChannelDescriptor,
} from "rxfy-server/hub";

// One hub per process. The custom server (server.mts) and Next's route-handler bundle each load
// their own copy of this module, so the instance is shared through globalThis — same trick the
// in-memory store uses.
const globalForHub = globalThis as unknown as { __nextBlogHub?: Hub };
export const hub: Hub = (globalForHub.__nextBlogHub ??= createInMemoryHub());

// HMAC secret for signing/verifying channel grants — shared with the WebSocket server (server.mts)
// so grants signed here verify there. Override via RXFY_SECRET in production.
// eslint-disable-next-line turbo/no-undeclared-env-vars -- app-level secret, declared per-deploy
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

// The stateless grant half of the live server. `issuer.serve` signs a per-state grant whose claims
// name the channel AND the payload's entity topics, so the WebSocket server subscribes the socket
// to exactly those; `issuer.renew` reissues one nearing expiry (the browser renews via POST
// /api/live/renew). No session, no request, no hub interaction.
export const issuer = createGrantIssuer({ secret: SECRET, grantTtlMs: 15 * 60_000, renewGraceMs: 5 * 60_000 });

/** Mark a state channel stale — every client subscribed to it gets a live update badge. */
export function touchState(state: StateChannelDescriptor, params: Record<string, unknown>): void {
  const channel = invalidationChannel(state, params);
  hub.publish(channelSubscription(channel), stale(channel));
}
