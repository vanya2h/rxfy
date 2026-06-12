"use client";

import { StoreProvider } from "rxfy-react";
import { HydrationStream } from "rxfy-react/next";

export function RxfyProvider({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider ssr>
      <HydrationStream />
      {children}
    </StoreProvider>
  );
}
