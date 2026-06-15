import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("posts", "routes/posts.tsx"),
  route("posts/:postId", "routes/posts.$postId.tsx"),
] satisfies RouteConfig;
