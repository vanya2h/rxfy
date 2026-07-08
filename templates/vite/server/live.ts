import { createInMemoryHub, createServer, createTopicKeyer } from "rxfy-server";
import { resources } from "../src/resources.js";
import { db } from "./db.js";

export const hub = createInMemoryHub();

export const live = createServer({
  db,
  resources,
  hub,
  keyer: createTopicKeyer({ secret: process.env.RXFY_SECRET ?? "dev-secret", windowMs: 10 * 60_000 }),
});
