import type { IModelRegistry } from "rxfy";
import { stale } from "rxfy-protocol";
import {
  channelSubscription,
  createInMemoryHub,
  grantsHydration,
  type Hub,
  invalidationChannel,
  signGrant,
  type StateChannelDescriptor,
  touch,
  verifyGrant,
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

// Grant lifetime; the client renews before this elapses via POST /api/live/renew. The grace window
// still renews a grant expired by up to this long, covering a tab that was asleep.
const GRANT_TTL_MS = 15 * 60_000;
const RENEW_GRACE_MS = 5 * 60_000;

const signChannel = (channel: string): string => signGrant({ channel, secret: SECRET, ttlMs: GRANT_TTL_MS });

/**
 * Sign a channel grant for this state instance and attach it to the payload as `$grant`. Stateless
 * — the hub is never touched here; the client lifts `$grant` (via useStateData) and presents it on
 * its own subscribe frame, which the WebSocket server verifies against the same SECRET.
 */
export function serve<TShape extends object>(
  state: StateChannelDescriptor,
  params: Record<string, unknown>,
  data: TShape,
): TShape & { $grant: string } {
  return { ...data, $grant: signChannel(invalidationChannel(state, params)) };
}

/** Verify (with grace) and reissue one grant; null = signature invalid or beyond grace (denied). */
export function renew(grant: string): string | null {
  const claims = verifyGrant(grant, { secret: SECRET, graceMs: RENEW_GRACE_MS });
  return claims === null ? null : signChannel(claims.channel);
}

/** Mark a state channel stale — every socket subscribed to it via a live grant gets an update badge. */
export function touchState(state: StateChannelDescriptor, params: Record<string, unknown>): void {
  const { channel } = touch(state, params);
  hub.publish(channelSubscription(channel), stale(channel));
}

/** SSR payload: signs a grant per channel the render logged into the registry, returns the script. */
export function hydration(registry: IModelRegistry): string {
  return grantsHydration(registry, { secret: SECRET, ttlMs: GRANT_TTL_MS });
}
