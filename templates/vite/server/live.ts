import { createInMemoryHub, createServer, createTopicKeyer } from "rxfy-server";
import { resources } from "../src/resources.js";
import { db } from "./db.js";

export const hub = createInMemoryHub();

// In dev this module is instantiated twice (tsx graph + Vite SSR graph), so there are two hubs.
// That's fine: grants minted by either instance validate against both, because the keyer is
// deterministic from the shared secret + clock and the hub state lives with the tsx instance.
export const live = createServer({
  db,
  resources,
  hub,
  keyer: createTopicKeyer({ secret: process.env.RXFY_SECRET ?? "dev-secret", windowMs: 10 * 60_000 }),
});
