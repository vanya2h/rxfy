import { collectShapeTopics, type FieldsMap } from "rxfy";
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
 * Attach a signed grant to a served payload. The grant's claims name the channel AND the entity
 * topics the payload holds, so the WebSocket server subscribes the socket to exactly those.
 * Stateless — no session, no request. The client lifts `$grant`, subscribes on its own WebSocket,
 * and refetches when it goes stale.
 */
export function serve<T extends object>(
  state: StateChannelDescriptor & { fields: FieldsMap },
  params: Record<string, unknown>,
  data: T,
): T & { $grant: string } {
  const channel = invalidationChannel(state, params);
  const entities = collectShapeTopics(state.fields, data as Record<string, unknown>);
  return { ...data, $grant: signGrant({ channel, entities, secret: SECRET, ttlMs: GRANT_TTL_MS }) };
}

/** Reissue a grant nearing expiry, preserving its entities (or null when it fails to verify). */
export function renewGrant(grant: string): string | null {
  const claims = verifyGrant(grant, { secret: SECRET, graceMs: RENEW_GRACE_MS });
  if (!claims) return null;
  return signGrant({ channel: claims.channel, entities: claims.entities, secret: SECRET, ttlMs: GRANT_TTL_MS });
}

/** Mark a state channel stale — every client subscribed to it gets a live update badge. */
export function touchState(state: StateChannelDescriptor, params: Record<string, unknown>): void {
  const channel = invalidationChannel(state, params);
  hub.publish(channelSubscription(channel), stale(channel));
}
