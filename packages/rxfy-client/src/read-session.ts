/** First `session` present in the SSR hydration chunks (all chunks of one request share it). */
export function readSsrSession(): string | undefined {
  const chunks = (globalThis as { __RXFY_SSR__?: Array<{ session?: string }> }).__RXFY_SSR__ ?? [];
  for (const chunk of chunks) {
    if (typeof chunk.session === "string") return chunk.session;
  }
  return undefined;
}
