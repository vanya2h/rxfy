// Test stand-in for next/navigation — collects insertion callbacks for assertions.
import type { ReactNode } from "react";

export const insertedCallbacks: (() => ReactNode)[] = [];

export function useServerInsertedHTML(callback: () => ReactNode): void {
  insertedCallbacks.push(callback);
}

export function resetInsertedCallbacks(): void {
  insertedCallbacks.length = 0;
}
