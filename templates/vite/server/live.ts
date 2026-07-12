import { createInMemoryHub, createServer } from "rxfy-server";
import { resources } from "../src/resources.js";
import { db } from "./db.js";

// The hub holds live channel subscriptions, so there must be exactly ONE instance — the tsx-graph
// one. entry-server receives `live` as a parameter instead of importing this module, so the Vite
// SSR graph never instantiates a second hub.
export const hub = createInMemoryHub();

// HMAC secret for signing/verifying channel grants — shared with the WebSocket server (ws.ts) so
// grants signed here verify there. Override via RXFY_SECRET in production.
export const SECRET = process.env.RXFY_SECRET ?? "dev-secret-change-me";

export const live = createServer({ db, resources, hub, secret: SECRET });
