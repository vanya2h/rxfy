import type { Hono } from "hono";
import type { Live } from "rxfy-server";

/**
 * The SSR entry contract: implemented by src/entry-server.tsx, invoked by server/render.ts with
 * THIS module graph's `live` and in-process `api.request` — a Vite-side copy would have its own
 * hub and db.
 */
export type RenderFn = (url: string, live: Live, apiFetch: Hono["request"]) => Promise<{ html: string; state: string }>;
