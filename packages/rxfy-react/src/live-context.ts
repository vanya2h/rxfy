import { createContext, useContext } from "react";
import type { LiveClient } from "./live/live-client.js";

export const LiveClientContext = createContext<LiveClient | null>(null);

/** The live client, or null when no `liveClient` was provided to StoreProvider. */
export function useLiveClient(): LiveClient | null {
  return useContext(LiveClientContext);
}
