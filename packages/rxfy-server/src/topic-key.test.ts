import { describe, expect, it } from "vitest";
import { createTopicKeyer } from "./topic-key.js";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

describe("createTopicKeyer.current", () => {
  it("is deterministic for the same topic, window, and secret", () => {
    const a = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5000 });
    const b = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5500 });
    // 5000 and 5500 are both in window 5 -> same id
    expect(a.current("post:1")).toBe(b.current("post:1"));
  });

  it("differs by topic", () => {
    const k = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5000 });
    expect(k.current("post:1")).not.toBe(k.current("post:2"));
  });

  it("differs by secret", () => {
    const k1 = createTopicKeyer({ secret: "s1", windowMs: 1000, now: () => 5000 });
    const k2 = createTopicKeyer({ secret: "s2", windowMs: 1000, now: () => 5000 });
    expect(k1.current("post:1")).not.toBe(k2.current("post:1"));
  });

  it("produces an opaque base64url id that does not leak the plaintext topic", () => {
    const k = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5000 });
    const id = k.current("post:42");
    expect(id).toMatch(BASE64URL);
    expect(id).not.toContain("post");
    expect(id).not.toContain("42");
  });
});

describe("createTopicKeyer.forPublish", () => {
  it("returns the current and previous window ids", () => {
    let t = 5000; // window 5
    const k = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => t });
    const before = k.current("post:1"); // window 5

    t = 6000; // window 6
    const after = k.current("post:1");
    expect(after).not.toBe(before);

    // at window 6, forPublish covers [window 6, window 5]
    expect(k.forPublish("post:1")).toEqual([after, before]);
  });

  it("first element equals current()", () => {
    const k = createTopicKeyer({ secret: "s", windowMs: 1000, now: () => 5000 });
    expect(k.forPublish("post:1")[0]).toBe(k.current("post:1"));
  });
});
