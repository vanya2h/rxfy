import { createInMemoryHub, createSync, type Hub } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { db } from "./db";

// One hub per process, shared across bundles via globalThis: the WebSocket server (server.mts) and
// the route handlers that publish (sync.create/update/touch) must share it or subscriptions never
// receive publishes.
const globalForHub = globalThis as unknown as { __rxfyTodosHub?: Hub };
export const hub: Hub = (globalForHub.__rxfyTodosHub ??= createInMemoryHub());

// HMAC secret for signing/verifying channel grants — shared with the WebSocket server so grants
// signed by sync.serve verify there. Override via RXFY_SECRET in production.
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

export const sync = createSync({ storage: drizzleStorage(db), hub, secret: SECRET });
