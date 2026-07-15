import { createInMemoryHub, createSync } from "rxfy-server";
import { drizzleStorage } from "rxfy-server-drizzle";
import { db } from "./db.js";

// One hub instance — entry-server receives `sync` as a parameter, so the Vite SSR graph never
// instantiates a second hub.
export const hub = createInMemoryHub();

// HMAC secret shared with the WebSocket server (ws.ts). Override via RXFY_SECRET in production.
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

export const sync = createSync({
  storage: drizzleStorage(db),
  hub,
  secret: SECRET,
});
