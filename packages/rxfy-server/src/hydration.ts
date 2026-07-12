import { dehydrate, hydrationScript, type IModelRegistry } from "rxfy";
import { signGrant } from "./grant.js";

/**
 * One-call SSR payload: signs a grant per channel the render logged into the registry and returns
 * the hydration script with the grants embedded. The client lifts them (`readSsrGrants`) and
 * subscribes — entity topics ride the client's first subscribe frame, derived from the hydrated
 * stores. `createServer`'s `live.hydration` wraps this; import directly from `rxfy-server/hub`
 * for apps on the bare hub (no Drizzle stack).
 */
export function grantsHydration(registry: IModelRegistry, opts: { secret: string; ttlMs?: number }): string {
  const grants = [...registry.channels.all()].map((channel) =>
    signGrant({ channel, secret: opts.secret, ttlMs: opts.ttlMs ?? 15 * 60_000 }),
  );
  return hydrationScript({ ...dehydrate(registry), grants });
}
