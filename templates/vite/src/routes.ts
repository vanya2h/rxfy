import type { StateChannelDescriptor } from "rxfy-server";
import { todosState } from "./todos.js";

/** The state instances a pathname renders — used to mint live-grant channels during SSR. */
export function routeStates(pathname: string): Array<{ state: StateChannelDescriptor; params: Record<string, unknown> }> {
  if (pathname === "/") return [{ state: todosState as unknown as StateChannelDescriptor, params: {} }];
  return [];
}
