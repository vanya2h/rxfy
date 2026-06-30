/** Names of params that slice *within* a dataset (page, cursor, sort) — excluded from the channel. */
export type WindowSpec = readonly string[];

/** The minimal shape `invalidationChannel` needs from a state descriptor. */
export type StateChannelDescriptor = {
  key: string;
  window?: WindowSpec;
};

const encode = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);

/** Deterministic, order-independent encoding of the partition params. */
const stableKey = (params: Record<string, unknown>): string =>
  Object.keys(params)
    .filter((key) => params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${encode(params[key])}`)
    .join("&");

/**
 * Derive the invalidation channel for a state instance. Window dims (page, sort, cursor…) are
 * dropped so every window of the same partition shares one channel. Pure and identical on client
 * and server, so the strings always match.
 */
export function invalidationChannel(state: StateChannelDescriptor, params: Record<string, unknown>): string {
  const windowKeys = new Set<string>(state.window ?? []);
  const partition: Record<string, unknown> = {};
  for (const key of Object.keys(params)) {
    if (!windowKeys.has(key)) {
      partition[key] = params[key];
    }
  }
  const suffix = stableKey(partition);
  return suffix ? `${state.key}:${suffix}` : state.key;
}
