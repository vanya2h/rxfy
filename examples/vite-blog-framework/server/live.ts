/* eslint-disable turbo/no-undeclared-env-vars */
import { createInMemoryHub, createServer, createTopicKeyer } from "rxfy-server";
import { resources } from "../src/blog/resources.js";
import { db } from "./db.js";

export const hub = createInMemoryHub();

export const live = createServer({
  db,
  resources,
  hub,
  keyer: createTopicKeyer({ secret: process.env.RXFY_SECRET ?? "dev-secret", windowMs: 10 * 60_000 }),
});
