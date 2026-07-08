"use client";
import type { ReactNode } from "react";
import { StoreProvider } from "rxfy-react";

export function RxfyProvider({ children }: { children: ReactNode }) {
  return <StoreProvider ssr>{children}</StoreProvider>;
}
