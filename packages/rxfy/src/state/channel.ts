import { stableStringify } from "../query/stable-stringify.js";

/** The minimal shape channel derivation needs from a state descriptor. */
export type ChannelStateDescriptor = { key?: string; window?: readonly string[] };

const encode = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : stableStringify(value);

/**
 * Window-independent invalidation channel for a state instance; `undefined` for keyless states.
 * Window dims (page, sort, cursor…) are dropped so every window of one partition shares a channel.
 * The single canonical implementation — client subscriptions and server publishes both use it.
 */
export function stateChannel(state: ChannelStateDescriptor, params: Record<string, unknown>): string | undefined {
  if (!state.key) return undefined;
  const windowKeys = new Set<string>(state.window ?? []);
  const suffix = Object.keys(params)
    .filter((k) => !windowKeys.has(k) && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${encode(params[k])}`)
    .join("&");
  return suffix ? `${state.key}:${suffix}` : state.key;
}
