import { randomUUID } from "node:crypto";
import { dehydrate, hydrationScript, type IModelRegistry } from "rxfy";
import { channelSubscription, type Hub } from "./hub.js";

/**
 * One-call SSR payload over a bare hub: mints a session, subscribes it to every channel the render
 * logged into the registry (plus `extraIds`, e.g. entity subscriptions), and returns the hydration
 * script with the session embedded. `createServer`'s `live.hydration` wraps this; import it directly
 * from `rxfy-server/hub` when an app uses the hub without the Drizzle writer stack.
 */
export function hubHydration(hub: Hub, registry: IModelRegistry, extraIds: string[] = []): string {
  const session = randomUUID();
  const channelIds = [...registry.channels.all()].map(channelSubscription);
  hub.subscribe(session, [...channelIds, ...extraIds]);
  return hydrationScript({ ...dehydrate(registry), session });
}
