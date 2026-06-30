import { describe, expect, it } from "vitest";
import { stateChannel } from "./channel.js";

describe("stateChannel", () => {
  it("drops window params so all windows of a partition share a channel", () => {
    const a = stateChannel({ key: "posts", window: ["page", "sort"] }, { orgId: "A", page: 3, sort: "top" });
    const b = stateChannel({ key: "posts", window: ["page", "sort"] }, { orgId: "A", page: 0, sort: "new" });
    expect(a).toBe("posts:orgId=A");
    expect(a).toBe(b);
  });

  it("returns the key alone when no partition params remain", () => {
    expect(stateChannel({ key: "posts", window: ["page"] }, { page: 1 })).toBe("posts");
  });

  it("returns undefined for a keyless state", () => {
    expect(stateChannel({ key: undefined, window: [] }, { orgId: "A" })).toBeUndefined();
  });

  it("is order-independent and encodes primitives without quotes", () => {
    expect(stateChannel({ key: "x" }, { b: 2, a: "1" })).toBe("x:a=1&b=2");
  });
});
