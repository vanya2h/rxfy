import { describe, expect, it } from "vitest";
import { initDb } from "./db";
import { serveTodos } from "./todos-service";

describe("SSR data path (in-process serve)", () => {
  it("serves seeded todos with a signed channel grant", async () => {
    await initDb();
    const served = await serveTodos();
    expect(served.todos.some((t) => t.title === "Open this app in a second tab")).toBe(true);
    expect(typeof served.$grant).toBe("string");
    expect(served.$grant.length).toBeGreaterThan(0);
  }, 30_000);
});
