import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { todoModel } from "../models.ts";
import { createLiveClient, type LiveClient } from "./liveClient.ts";
import { useLiveEntities } from "./useLiveEntities.ts";
import { useStoreSubscriptions } from "./useStoreSubscriptions.ts";

// undefined = no provider; null = provider present but no socket (SSR).
const LiveContext = createContext<LiveClient | null | undefined>(undefined);

export function useLiveClient(): LiveClient | null {
  const client = useContext(LiveContext);
  if (client === undefined) throw new Error("useLiveClient must be used within <LiveProvider>");
  return client;
}

// Child of the context provider so its hooks can read the client via useLiveClient.
function LiveBridge({ socket }: { socket: WebSocket | null }) {
  useStoreSubscriptions(); // outbound: subscribe to whatever the store holds
  useLiveEntities(todoModel, socket); // inbound: apply pushes — one line per live model
  return null;
}

export function LiveProvider({ children }: { children: ReactNode }) {
  // WebSocket only exists in the browser — stay inert during SSR.
  const socket = useMemo(
    () => (typeof window === "undefined" ? null : new WebSocket(`ws://${window.location.host}/ws`)),
    [],
  );
  const client = useMemo(() => (socket ? createLiveClient(socket) : null), [socket]);

  useEffect(() => () => socket?.close(), [socket]);

  return (
    <LiveContext.Provider value={client}>
      <LiveBridge socket={socket} />
      {children}
    </LiveContext.Provider>
  );
}
