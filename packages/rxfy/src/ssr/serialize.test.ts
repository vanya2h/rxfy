import { describe, expect, it } from "vitest";
import { rehydrateError, serializeError, serializeForHtml } from "./serialize.js";

describe("serializeError / rehydrateError", () => {
  it("round-trips name and message, strips stack", () => {
    const original = new TypeError("boom");
    const serialized = serializeError(original);
    expect(serialized).toEqual({ name: "TypeError", message: "boom" });
    const rehydrated = rehydrateError(serialized);
    expect(rehydrated).toBeInstanceOf(Error);
    expect(rehydrated.name).toBe("TypeError");
    expect(rehydrated.message).toBe("boom");
  });

  it("handles non-Error throws", () => {
    expect(serializeError("oops")).toEqual({ name: "Error", message: "oops" });
  });
});

describe("serializeForHtml", () => {
  it("escapes < to prevent script-tag breakout", () => {
    const out = serializeForHtml({ html: "</script><script>alert(1)" });
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
    expect(JSON.parse(out)).toEqual({ html: "</script><script>alert(1)" });
  });
});
