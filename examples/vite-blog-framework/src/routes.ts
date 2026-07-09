export type Route = { name: "home" } | { name: "post"; postId: string } | { name: "not-found" };

/** Parse a pathname into a route. */
export function matchRoute(pathname: string): Route {
  if (pathname === "/") return { name: "home" };
  const m = /^\/posts\/([^/]+)\/?$/.exec(pathname);
  if (m) return { name: "post", postId: decodeURIComponent(m[1]!) };
  return { name: "not-found" };
}
