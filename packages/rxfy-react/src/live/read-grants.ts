import type { Grants } from "./live-client.js";

/** Merge `grants` from all SSR hydration chunks present at load time (last-writer-wins). */
export function readSsrGrants(): Grants {
  const chunks = (globalThis as { __RXFY_SSR__?: Array<{ grants?: Partial<Grants> }> }).__RXFY_SSR__ ?? [];
  const entities: Record<string, string> = {};
  const channels: Record<string, string> = {};
  for (const chunk of chunks) {
    Object.assign(entities, chunk.grants?.entities);
    Object.assign(channels, chunk.grants?.channels);
  }
  return { entities, channels };
}
