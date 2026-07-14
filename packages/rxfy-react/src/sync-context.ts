import { createContext, useContext } from "react";
import type { SyncClient } from "rxfy-client";

export const SyncClientContext = createContext<SyncClient | null>(null);

/** The sync client, or null when no `syncClient` was provided to StoreProvider. */
export function useSyncClient(): SyncClient | null {
  return useContext(SyncClientContext);
}
