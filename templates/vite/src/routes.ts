import type { StateChannelDescriptor } from "rxfy-server";
import { todosState } from "./todos.js";

// StateDescriptor.key is `string | undefined` in rxfy but StateChannelDescriptor requires `string`;
// todosState supplies a key, so the cast is safe.
export const todosChannel = todosState as unknown as StateChannelDescriptor;

/** The state instances a pathname renders — used to mint live-grant channels during SSR. */
export function routeStates(pathname: string): Array<{ state: StateChannelDescriptor; params: Record<string, unknown> }> {
  if (pathname === "/") return [{ state: todosChannel, params: {} }];
  return [];
}
