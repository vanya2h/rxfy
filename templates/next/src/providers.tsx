"use client";
import type { ReactNode } from "react";
import { StoreProvider } from "rxfy-react";
import { sync } from "./sync-client";

export function RxfyProvider({ children }: { children: ReactNode }) {
  // In the browser the registry + sync client come from the live singleton, so patch/stale messages
  // land in the same stores the views read; during SSR `sync` is undefined and StoreProvider creates
  // its own per-render registry.
  return (
    <StoreProvider ssr registry={sync?.registry} syncClient={sync?.syncClient}>
      {children}
    </StoreProvider>
  );
}
