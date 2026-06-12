"use client";

import { HydrationStream } from "rxfy-react/next";
import { StoreProvider } from "rxfy-react";

export function RxfyProvider({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider ssr>
      <HydrationStream />
      {children}
    </StoreProvider>
  );
}
