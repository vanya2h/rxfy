/**
 * The drizzle-free live core: the in-memory hub, subscription-id helpers, channel derivation
 * (`touch`), and the SSR hydration helper (`hubHydration`). Import from `rxfy-server/hub` when an
 * app only needs stale-notification plumbing — e.g. an in-memory-store example publishing `stale`
 * on writes — without pulling in the Drizzle writer stack behind the main entry.
 */
export * from "./hub.js";
export * from "./hydration.js";
export * from "./state-channel.js";
