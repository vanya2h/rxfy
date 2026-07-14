import { hc } from "hono/client";
import type { AppType } from "../server/app";

/**
 * The browser-side typed RPC client — refetches and mutations go over HTTP to the same endpoints
 * the RSC pages call in-process (see api-server.ts). It needs no per-environment configuration, so
 * it's a plain module singleton — no context. SSR never fetches through it: pages pass RSC-fetched
 * data down as `defaultData`, which seeds the store before any fetch can fire. Sync subscriptions
 * ride channel grants (returned as `$grant`), so the client carries no session header. `.api`
 * unwraps the app's `/api` basePath.
 */
export const api = hc<AppType>("/").api;
