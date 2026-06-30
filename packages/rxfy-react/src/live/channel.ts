export type ChannelStateDescriptor = { key?: string; window?: readonly string[] };

/** Deterministic JSON: object keys sorted recursively so logically-equal values stringify equally.
 *  MUST stay identical to rxfy-server's state-channel encoding so client/server channels match. */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(",")}}`;
};

const encode = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : stableStringify(value);

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
