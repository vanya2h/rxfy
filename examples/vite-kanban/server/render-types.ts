import type { Hono } from "hono";
import type { Sync } from "rxfy-server";

/**
 * The SSR entry contract: implemented by src/entry-server.tsx, invoked by server/render.ts with THIS
 * module graph's `sync` and in-process `api.request`.
 */
export type RenderFn = (
  url: string,
  sync: Sync<any>,
  apiFetch: Hono["request"],
) => Promise<{ html: string; state: string }>;
