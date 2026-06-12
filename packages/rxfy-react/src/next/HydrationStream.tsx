"use client";

import { useServerInsertedHTML } from "next/navigation";
import { useRef } from "react";
import { dehydrate, type DehydratedState, serializeForHtml } from "rxfy";
import { useModelRegistry } from "../registry-context.js";

/**
 * Next.js App Router streaming adapter. Render once inside StoreProvider; each stream
 * flush emits newly settled queries / newly written entities as a window.__RXFY_SSR__
 * push — StoreProvider on the client ingests them, including late-arriving chunks.
 */
export function HydrationStream() {
  const registry = useModelRegistry();
  const flushedQueries = useRef(new Set<string>());
  const flushedEntities = useRef(new Set<string>());

  useServerInsertedHTML(() => {
    const full = dehydrate(registry);
    const delta: DehydratedState = { queries: {}, models: {} };
    let hasData = false;

    for (const [key, entry] of Object.entries(full.queries)) {
      if (flushedQueries.current.has(key)) continue;
      flushedQueries.current.add(key);
      delta.queries[key] = entry;
      hasData = true;
    }
    for (const [name, entities] of Object.entries(full.models)) {
      for (const [key, entity] of Object.entries(entities)) {
        const id = JSON.stringify([name, key]); // collision-free composite key
        if (flushedEntities.current.has(id)) continue;
        flushedEntities.current.add(id);
        (delta.models[name] ??= {})[key] = entity;
        hasData = true;
      }
    }

    if (!hasData) return null;
    return (
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__RXFY_SSR__=window.__RXFY_SSR__||[];window.__RXFY_SSR__.push(${serializeForHtml(delta)})`,
        }}
      />
    );
  });

  return null;
}
