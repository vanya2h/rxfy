"use client";

import { useState } from "react";
import { type DehydratedState, hydrate } from "rxfy";
import { useModelRegistry } from "rxfy-react";

/**
 * Merges a server-produced snapshot into the provider's shared registry exactly once
 * (the useState initializer runs once per mount, on both SSR and client). Rendered before
 * the data-reading components so the store is populated when they read.
 */
export function HydrateSnapshot({ snapshot }: { snapshot: DehydratedState }) {
  const registry = useModelRegistry();
  useState(() => {
    hydrate(registry, snapshot);
    return null;
  });
  return null;
}
