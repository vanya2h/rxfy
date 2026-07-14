import type { Hono } from "hono";
import type { hc } from "hono/client";
import { createContext, type ReactNode, useContext } from "react";
import type { AppType } from "../server/api.ts";

/** The shape of hono's in-process `api.request` — what the server injects for SSR. */
export type ApiFetch = Hono["request"];

/**
 * The typed RPC client over the hono endpoints — the single source of truth for reads. Each entry
 * instantiates its own `hc`: the browser one makes a real network trip against `/api`, the SSR one
 * wraps the server's in-process `api.request` — the same routes serve both environments, and no
 * server code is imported here (faker stays out of the client bundle by construction).
 */
export type ApiClient = ReturnType<typeof hc<AppType>>;

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

/** The typed RPC client from context — call endpoints directly: `api.users.$get()`. */
export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("ApiProvider not found");
  return client;
}
