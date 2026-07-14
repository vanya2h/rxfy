import { stateChannel } from "rxfy";

/** Names of params that slice *within* a dataset (page, cursor, sort) — excluded from the channel. */
export type WindowSpec = readonly string[];

/** The minimal shape `invalidationChannel` needs from a state descriptor. */
export type StateChannelDescriptor = {
  key: string;
  window?: WindowSpec;
};

/**
 * Derive the invalidation channel for a state instance. Thin wrapper over rxfy core's
 * `stateChannel` — `key` is required here, so the result is always a string.
 */
export function invalidationChannel(state: StateChannelDescriptor, params: Record<string, unknown>): string {
  return stateChannel(state, params) as string;
}

/** A target state channel to mark stale (no data — clients refetch on demand). */
export type TouchTarget = { channel: string };

/** Build a touch target from a state descriptor + params (window dims dropped). */
export function touch(state: StateChannelDescriptor, params: Record<string, unknown>): TouchTarget {
  return { channel: invalidationChannel(state, params) };
}
