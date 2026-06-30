export type ChannelStateDescriptor = { key?: string; window?: readonly string[] };

const encode = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : JSON.stringify(value);

/** Window-independent invalidation channel for a state instance; `undefined` for keyless states. */
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
