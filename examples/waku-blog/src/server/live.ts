import { RXFY_SESSION_HEADER, stale } from "rxfy-protocol";
import { channelSubscription, createInMemoryHub, type Hub, type StateChannelDescriptor, touch } from "rxfy-server/hub";

// One hub per process, shared across waku's bundles through globalThis — same trick the
// in-memory store uses.
const globalForHub = globalThis as unknown as { __wakuBlogHub?: Hub };
export const hub: Hub = (globalForHub.__wakuBlogHub ??= createInMemoryHub());

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
