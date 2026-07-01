import type { MiddlewareHandler } from "hono";
import { app } from "../server/app";

const apiMiddleware = (): MiddlewareHandler => async (c, next) => {
  if (c.req.path.startsWith("/api/")) {
    return app.fetch(c.req.raw);
  }
  await next();
};

export default apiMiddleware;
