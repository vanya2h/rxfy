import type { Hono } from "hono";
import { hc } from "hono/client";
import { createContext, type ReactNode, useContext } from "react";
import type { AppType } from "../../server/api.js";

/** The shape of hono's in-process `app.request` — what the server entry injects for SSR. */
export type ApiFetch = Hono["request"];

/**
 * The typed hono RPC client. Instantiate one per entry point with `hc<AppType>(...)`: the browser
 * entry points it at `/api` (a real network trip); the server entry passes hono's in-process
 * `app.request`, so the same routes serve both environments. Sync subscriptions ride channel grants
 * (returned as `$grant`), so the client carries no session header.
 */
export type ApiClient = ReturnType<typeof hc<AppType>>;

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

/** The typed RPC client from context. */
export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("ApiProvider not found");
  return client;
}
