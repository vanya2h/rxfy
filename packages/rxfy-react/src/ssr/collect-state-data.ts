import type { IModelRegistry } from "rxfy";

/**
 * Two-pass SSR for strict renderToString environments (the Apollo getDataFromTree pattern):
 * render → await fetches that suspended into the registry's query cache → render again,
 * until a pass completes with nothing in flight. Each waterfall level costs one extra pass.
 */
export async function collectStateData(registry: IModelRegistry, render: () => string): Promise<string> {
  for (;;) {
    let html: string;
    try {
      html = render();
    } catch (error) {
      // React throws when a component suspends without a boundary; if fetches are in
      // flight this render registered them — await and retry. Otherwise it's a real error.
      const inflight = registry.queries.inflight();
      if (inflight.length === 0) throw error;
      await Promise.allSettled(inflight);
      continue;
    }
    const inflight = registry.queries.inflight();
    if (inflight.length === 0) return html;
    await Promise.allSettled(inflight);
  }
}
