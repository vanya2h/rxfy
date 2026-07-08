import { describe, expect, it } from "vitest";
import { initDb } from "../server/db.js";
import { render } from "./entry-server.js";

describe("SSR", () => {
  it("renders the todos page with data resolved and a hydration payload", async () => {
    await initDb();
    const { html, state } = await render("/");
    // Seeded todo is in the first-paint HTML — no PENDING flash.
    expect(html).toContain("Open this app in a second tab");
    expect(html).not.toContain("Loading…");
    // Hydration payload + live grants ride along in <!--app-state-->.
    expect(state).toContain("__RXFY_SSR__");
    expect(state).toContain("grants");
  }, 30_000);
});
