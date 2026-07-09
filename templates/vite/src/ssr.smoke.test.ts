import { describe, expect, it } from "vitest";
import { api } from "../server/api.js";
import { initDb } from "../server/db.js";
import { live } from "../server/live.js";
import { render } from "./entry-server.js";

describe("SSR", () => {
  it("renders the todos page with data resolved and a hydration payload", async () => {
    await initDb();
    // SSR fetches flow through the in-process hono api — the same endpoints the browser hits.
    const { html, state } = await render("/", live, api.request);
    // Seeded todo is in the first-paint HTML — no PENDING flash.
    expect(html).toContain("Open this app in a second tab");
    expect(html).not.toContain("Loading…");
    // Hydration payload + the live session id ride along in <!--app-state-->.
    expect(state).toContain("__RXFY_SSR__");
    expect(state).toContain("session");
  }, 30_000);
});
