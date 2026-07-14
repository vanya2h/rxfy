import { hc } from "hono/client";
import type { AppType } from "../server/app";

/**
 * The browser-side typed RPC client — refetches and mutations go over HTTP to the same endpoints
 * the RSC pages call in-process (see api-server.ts). Sync subscriptions ride channel grants
 * (returned in each read as `$grant`), so requests carry no session header — the client is a plain
 * module singleton. SSR never fetches through it: pages pass RSC-fetched data down as
 * `defaultData`, which seeds the store before any fetch can fire. `.api` unwraps the `/api` basePath.
 */
export const api = hc<AppType>("/").api;
