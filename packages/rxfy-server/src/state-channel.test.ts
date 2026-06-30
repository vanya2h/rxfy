import { describe, expect, it } from "vitest";
import { invalidationChannel } from "./state-channel.js";

const postsState = { key: "posts", window: ["page", "sort"] as const };

describe("invalidationChannel", () => {
  it("drops window params so all pages/sorts of a partition share one channel", () => {
    const a = invalidationChannel(postsState, { orgId: "A", page: 3, sort: "top" });
    const b = invalidationChannel(postsState, { orgId: "A", page: 0, sort: "new" });
    expect(a).toBe("posts:orgId=A");
    expect(b).toBe("posts:orgId=A");
    expect(a).toBe(b);
  });

  it("separates different partitions", () => {
    expect(invalidationChannel(postsState, { orgId: "A", page: 1 })).not.toBe(
      invalidationChannel(postsState, { orgId: "B", page: 1 }),
    );
  });

  it("is independent of partition-param key order", () => {
    const s = { key: "posts" };
    expect(invalidationChannel(s, { orgId: "A", team: "X" })).toBe(invalidationChannel(s, { team: "X", orgId: "A" }));
  });

  it("returns just the state key when there are no partition params", () => {
    expect(invalidationChannel({ key: "posts", window: ["page"] }, { page: 2 })).toBe("posts");
    expect(invalidationChannel({ key: "posts" }, {})).toBe("posts");
  });

  it("encodes primitive partition values without quotes", () => {
    expect(invalidationChannel({ key: "items" }, { tier: 2, active: true })).toBe("items:active=true&tier=2");
  });

  it("ignores undefined params", () => {
    expect(invalidationChannel({ key: "posts" }, { orgId: "A", note: undefined })).toBe("posts:orgId=A");
  });

  it("JSON-encodes object-valued partition params deterministically", () => {
    const s = { key: "search" };
    expect(invalidationChannel(s, { filter: { q: "x" } })).toBe('search:filter={"q":"x"}');
  });
});
