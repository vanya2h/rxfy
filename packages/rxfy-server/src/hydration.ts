import { dehydrate, hydrationScript, type IModelRegistry } from "rxfy";

/**
 * One-call SSR payload: embeds the grants the render logged into the registry (each already names
 * its channel + entities) and returns the hydration script. No signing here — `serve` produced the
 * grants; the client lifts them (`readSsrGrants`) and subscribes. `createServer`'s `live.hydration`
 * wraps this; import directly from `rxfy-server/hub` for apps on the bare hub (no Drizzle stack).
 */
export function grantsHydration(registry: IModelRegistry): string {
  return hydrationScript({ ...dehydrate(registry), grants: registry.grants.all() });
}
