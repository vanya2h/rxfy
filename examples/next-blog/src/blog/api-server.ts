import { hc } from "hono/client";
import { app, type AppType } from "../server/app";

/**
 * The server-side typed RPC client — RSC pages fetch through it during render. It routes requests
 * straight into the hono app in-process (no HTTP self-call), so the endpoints stay the single data
 * source in both environments. Each read returns a signed channel grant as `$grant`, which rides
 * along in `defaultData` to the browser, where the live client lifts it and subscribes. Server-only:
 * import from server components exclusively. `.api` unwraps the app's `/api` basePath.
 */
export const serverApi = hc<AppType>("http://ssr.internal", { fetch: app.request }).api;
