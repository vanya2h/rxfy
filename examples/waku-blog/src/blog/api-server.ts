import { hc } from "hono/client";
import { app, type AppType } from "../server/app";

/**
 * The server-side typed RPC client — RSC pages fetch through it during render. It routes requests
 * straight into the hono app in-process (no HTTP self-call), so the endpoints stay the single data
 * source in both environments. Server-only: import this from server components exclusively; the
 * browser gets its own client from api-client.ts. Sync subscriptions ride channel grants (returned
 * in the payload as `$grant`), so nothing is carried per-request. `.api` unwraps the app's `/api` basePath.
 */
export const serverApi = hc<AppType>("http://ssr.internal", { fetch: app.request }).api;
