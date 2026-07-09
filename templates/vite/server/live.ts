import { createInMemoryHub, createServer } from "rxfy-server";
import { resources } from "../src/resources.js";
import { db } from "./db.js";

// The hub holds live session subscriptions, so there must be exactly ONE instance — the tsx-graph
// one. entry-server receives `live` as a parameter instead of importing this module, so the Vite
// SSR graph never instantiates a second hub.
export const hub = createInMemoryHub();

export const live = createServer({ db, resources, hub });
