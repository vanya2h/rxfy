"use client";

import { StoreProvider } from "rxfy-react";

export function RxfyProvider({ children }: { children: React.ReactNode }) {
  return <StoreProvider ssr>{children}</StoreProvider>;
}
