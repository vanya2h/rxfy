import type { Hono } from "hono";
import { hc } from "hono/client";
import { createContext, type ReactNode, useContext } from "react";
import type { AppType } from "../../server/api.js";

/** The shape of hono's in-process `app.request` — what the server entry injects for SSR. */
export type ApiFetch = Hono["request"];

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * The typed RPC client over the hono endpoints — the single source of truth for reads and writes.
 * In the browser it makes a real network trip; during SSR the server entry passes its in-process
 * api (hono's `app.request`), so the same routes serve both environments — no server imports in
 * this module, no duplicated queries. Live subscriptions ride channel grants (returned in the
 * payload as `$grant`), so the client carries no session header.
 */
export function createApiClient(serverFetch?: ApiFetch) {
  return serverFetch ? hc<AppType>("http://ssr.internal", { fetch: serverFetch }) : hc<AppType>("/api");
}

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

/** The typed RPC client from context — call endpoints directly: `api.todos.$get()`. */
export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("ApiProvider not found");
  return client;
}
