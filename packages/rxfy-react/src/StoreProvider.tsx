import { createContext, type PropsWithChildren, useEffect, useState } from "react";
import { createModelRegistry, type DehydratedState, hydrate, type IModelRegistry } from "rxfy";
import type { LiveClient } from "rxfy-client";
import { LiveClientContext } from "./live-context.js";
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
  /** Optional live client for real-time updates. When omitted, useLiveClient() returns null. */
  liveClient?: LiveClient;
}>;

export function StoreProvider({
  children,
  ssr = false,
  registry: external,
  dehydratedState,
  liveClient,
}: StoreProviderProps) {
  const [registry] = useState(() => {
    const r = external ?? createModelRegistry();
    if (dehydratedState) hydrate(r, dehydratedState);
    // Synchronous so hydrated data is available on the first render (hydration correctness).
    // Safe under StrictMode double-invocation: re-hydrating the same chunks is an idempotent overwrite.
    ingestExistingChunks(r);
    return r;
  });

  useEffect(() => {
    // Chunks pushed between the initializer and mount sit in the array (push isn't patched yet) — drain them.
    ingestExistingChunks(registry);
    return subscribeToLateChunks(registry);
  }, [registry]);

  return (
    <ModelRegistryContext.Provider value={registry}>
      <SsrContext.Provider value={ssr}>
        <LiveClientContext.Provider value={liveClient ?? null}>{children}</LiveClientContext.Provider>
      </SsrContext.Provider>
    </ModelRegistryContext.Provider>
  );
}

function ingestExistingChunks(registry: IModelRegistry): void {
  if (typeof window === "undefined" || !window.__RXFY_SSR__) return;
  for (const chunk of window.__RXFY_SSR__) hydrate(registry, chunk);
}

// Late-streamed chunks (Suspense boundaries resolving after hydration) fan out to every mounted provider.
const listeners = new Set<IModelRegistry>();
let patchedQueue: DehydratedState[] | null = null;

function subscribeToLateChunks(registry: IModelRegistry): (() => void) | undefined {
  if (typeof window === "undefined") return undefined;
  const queue = (window.__RXFY_SSR__ = window.__RXFY_SSR__ ?? []);
  listeners.add(registry);
  if (patchedQueue !== queue) {
    patchedQueue = queue;
    queue.push = (...chunks: DehydratedState[]) => {
      // Keep chunks in the array so providers mounting later can still drain them.
      const length = Array.prototype.push.apply(queue, chunks);
      for (const chunk of chunks) {
        for (const listener of listeners) hydrate(listener, chunk);
      }
      return length;
    };
  }
  return () => {
    listeners.delete(registry);
  };
}
