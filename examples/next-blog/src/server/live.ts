import { RXFY_SESSION_HEADER, stale } from "rxfy-protocol";
import { channelSubscription, createInMemoryHub, type Hub, type StateChannelDescriptor, touch } from "rxfy-server/hub";

// One hub per process. The custom server (server.mts) and Next's route-handler bundle each load
// their own copy of this module, so the instance is shared through globalThis — same trick the
// in-memory store uses.
const globalForHub = globalThis as unknown as { __nextBlogHub?: Hub };
export const hub: Hub = (globalForHub.__nextBlogHub ??= createInMemoryHub());

/** Record a read: subscribe the requesting session (if any) to the state's invalidation channel. */
export function subscribeRead(req: Request, state: StateChannelDescriptor, params: Record<string, unknown>): void {
  const session = req.headers.get(RXFY_SESSION_HEADER);
  if (session) hub.subscribe(session, [channelSubscription(touch(state, params).channel)]);
}

/** Mark a state channel stale — every session that was served it gets a live update badge. */
export function touchState(state: StateChannelDescriptor, params: Record<string, unknown>): void {
  const { channel } = touch(state, params);
  hub.publish(channelSubscription(channel), stale(channel));
}
