import { createContext, type PropsWithChildren, useState } from "react";
import { createModelRegistry, type DehydratedState, hydrate, type IModelRegistry } from "rxfy";
import { ModelRegistryContext } from "./registry-context.js";

/** True when the app opted into SSR — gates useStateData's server-side Suspense behavior. */
export const SsrContext = createContext(false);

declare global {
  interface Window {
    /** Push protocol for streamed hydration chunks (see rxfy-react/next HydrationStream). */
    __RXFY_SSR__?: DehydratedState[];
  }
}

export type StoreProviderProps = PropsWithChildren<{
  /** Enables server-side fetch-and-suspend in useStateData. Pass the same value on server and client. */
  ssr?: boolean;
  /** Per-request registry created by server code so it can dehydrate after rendering. */
  registry?: IModelRegistry;
  /** Snapshot from dehydrate() for prop-based hydration (buffered/two-pass SSR). */
  dehydratedState?: DehydratedState;
}>;

export function StoreProvider({ children, ssr = false, registry: external, dehydratedState }: StoreProviderProps) {
  const [registry] = useState(() => {
    const r = external ?? createModelRegistry();
    if (dehydratedState) hydrate(r, dehydratedState);
    ingestWindowState(r);
    return r;
  });

  return (
    <ModelRegistryContext.Provider value={registry}>
      <SsrContext.Provider value={ssr}>{children}</SsrContext.Provider>
    </ModelRegistryContext.Provider>
  );
}

function ingestWindowState(registry: IModelRegistry): void {
  if (typeof window === "undefined") return;
  const queue = (window.__RXFY_SSR__ = window.__RXFY_SSR__ ?? []);
  for (const chunk of queue) hydrate(registry, chunk);
  // Late-streamed chunks (Suspense boundaries resolving after hydration) flow straight into the registry.
  queue.push = (...chunks: DehydratedState[]) => {
    for (const chunk of chunks) hydrate(registry, chunk);
    return queue.length;
  };
}
