import type { MiddlewareHandler } from "hono";
import { app } from "../server/app";
import { startLiveSocket } from "../server/ws";

// waku loads middleware at startup — bring the live WebSocket up with it.
startLiveSocket();

const apiMiddleware = (): MiddlewareHandler => async (c, next) => {
  if (c.req.path.startsWith("/api/")) {
    return app.fetch(c.req.raw);
  }
  await next();
};

export default apiMiddleware;
