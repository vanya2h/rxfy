import { stale } from "rxfy-protocol";
import {
  channelSubscription,
  createInMemoryHub,
  type Hub,
  invalidationChannel,
  signGrant,
  type StateChannelDescriptor,
  verifyGrant,
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

const GRANT_TTL_MS = 15 * 60_000; // the browser renews before expiry via POST /api/live/renew
const RENEW_GRACE_MS = 5 * 60_000; // a grant expired by up to this long still renews

/**
 * Attach a signed channel grant to a served payload. Stateless — no session, no request. The client
 * lifts `$grant`, subscribes the channel on its own WebSocket, and refetches when it goes stale.
 */
export function serve<T extends object>(
  state: StateChannelDescriptor,
  params: Record<string, unknown>,
  data: T,
): T & { $grant: string } {
  const channel = invalidationChannel(state, params);
  return { ...data, $grant: signGrant({ channel, secret: SECRET, ttlMs: GRANT_TTL_MS }) };
}

/** Reissue a grant nearing expiry (or null when it fails to verify) — the renew route's per-grant op. */
export function renewGrant(grant: string): string | null {
  const claims = verifyGrant(grant, { secret: SECRET, graceMs: RENEW_GRACE_MS });
  if (!claims) return null;
  return signGrant({ channel: claims.channel, secret: SECRET, ttlMs: GRANT_TTL_MS });
}

/** Mark a state channel stale — every client subscribed to it gets a live update badge. */
export function touchState(state: StateChannelDescriptor, params: Record<string, unknown>): void {
  const channel = invalidationChannel(state, params);
  hub.publish(channelSubscription(channel), stale(channel));
}
