import { describe, expect, it } from "vitest";
import { StatusEnum, createFulfilled, createPending, createRejected } from "../wrapped/wrapped.js";
import { deserializeWrapped, rehydrateError, serializeError, serializeForHtml, serializeWrapped } from "./serialize.js";

describe("serializeError / rehydrateError", () => {
  it("round-trips name and message, strips stack", () => {
    const original = new TypeError("boom");
    const serialized = serializeError(original);
    expect(serialized).toEqual({ name: "TypeError", message: "boom" });
    expect(serialized).not.toHaveProperty("stack");
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

  it("escapes U+2028/U+2029 line separators", () => {
    const out = serializeForHtml({ t: "  " });
    expect(out).not.toContain(" ");
    expect(out).not.toContain(" ");
    expect(JSON.parse(out)).toEqual({ t: "  " });
  });
});

describe("serializeWrapped / deserializeWrapped", () => {
  it("serializes FULFILLED keeping the value", () => {
    expect(serializeWrapped(createFulfilled({ a: 1 }))).toEqual({ type: StatusEnum.FULFILLED, value: { a: 1 } });
  });

  it("serializes REJECTED into a SerializedError", () => {
    const out = serializeWrapped(createRejected(new TypeError("boom")));
    expect(out).toEqual({ type: StatusEnum.REJECTED, error: { name: "TypeError", message: "boom" } });
  });

  it("returns undefined for non-terminal states", () => {
    expect(serializeWrapped(createPending())).toBeUndefined();
  });

  it("round-trips FULFILLED", () => {
    const w = deserializeWrapped(serializeWrapped(createFulfilled(42))!);
    expect(w).toEqual(createFulfilled(42));
  });

  it("rehydrates REJECTED into a live Error", () => {
    const w = deserializeWrapped(serializeWrapped(createRejected(new Error("nope")))!);
    expect(w.type).toBe(StatusEnum.REJECTED);
    expect((w as { error: unknown }).error).toBeInstanceOf(Error);
  });
});
