/** All `grants` arrays across the SSR hydration chunks, flattened. */
export function readSsrGrants(): string[] {
  const chunks = (globalThis as { __RXFY_SSR__?: Array<{ grants?: string[] }> }).__RXFY_SSR__ ?? [];
  return chunks.flatMap((chunk) => chunk.grants ?? []);
}
