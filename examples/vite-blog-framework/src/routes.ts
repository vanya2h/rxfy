import { postDetailState, postsState } from "examples-shared/data";
import type { StateChannelDescriptor } from "rxfy-server";

export type Route = { name: "home" } | { name: "post"; postId: string } | { name: "not-found" };

/** Parse a pathname into a route. */
export function matchRoute(pathname: string): Route {
  if (pathname === "/") return { name: "home" };
  const m = /^\/posts\/([^/]+)\/?$/.exec(pathname);
  if (m) return { name: "post", postId: decodeURIComponent(m[1]!) };
  return { name: "not-found" };
}

/** The state instances a route renders — used to mint grant channels during SSR. */
export function routeStates(route: Route): Array<{ state: StateChannelDescriptor; params: Record<string, unknown> }> {
  if (route.name === "home") return [{ state: postsState as StateChannelDescriptor, params: {} }];
  if (route.name === "post")
    return [{ state: postDetailState as StateChannelDescriptor, params: { postId: route.postId } }];
  return [];
}
