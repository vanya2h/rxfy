import { hc } from "hono/client";
import { RXFY_SESSION_HEADER } from "rxfy-protocol";
import { app, type AppType } from "../server/app";

/**
 * The server-side typed RPC client — RSC pages fetch through it during render. It routes requests
 * straight into the hono app in-process (no HTTP self-call), so the endpoints stay the single data
 * source in both environments. The render's minted `session` rides along as the live session
 * header, so everything served is registered for live pushes under it. Server-only: import this
 * from server components exclusively; the browser gets its own client from api-client.ts. `.api`
 * unwraps the app's `/api` basePath.
 */
export function serverApi(session: string) {
  return hc<AppType>("http://ssr.internal", { fetch: app.request, headers: { [RXFY_SESSION_HEADER]: session } }).api;
}
