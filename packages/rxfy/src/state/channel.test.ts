import { describe, expect, it } from "vitest";
import { stateChannel } from "./channel.js";

describe("stateChannel", () => {
  it("returns the bare key when there are no params", () => {
    expect(stateChannel({ key: "todos" }, {})).toBe("todos");
  });

  it("returns undefined for keyless states", () => {
    expect(stateChannel({}, { a: 1 })).toBeUndefined();
  });

  it("appends sorted key=value params", () => {
    expect(stateChannel({ key: "posts" }, { orgId: "A", author: 7 })).toBe("posts:author=7&orgId=A");
  });

  it("drops window params so every page shares one channel", () => {
    const state = { key: "posts", window: ["page", "sort"] as const };
    expect(stateChannel(state, { author: 7, page: 3, sort: "asc" })).toBe("posts:author=7");
    expect(stateChannel(state, { author: 7, page: 4, sort: "desc" })).toBe("posts:author=7");
  });

  it("drops undefined params", () => {
    expect(stateChannel({ key: "posts" }, { author: undefined, tag: "x" })).toBe("posts:tag=x");
  });

  it("encodes scalars raw and objects as sorted-key JSON", () => {
    expect(stateChannel({ key: "s" }, { flag: true, n: 2 })).toBe("s:flag=true&n=2");
    expect(stateChannel({ key: "s" }, { f: { b: 2, a: 1 } })).toBe('s:f={"a":1,"b":2}');
    expect(stateChannel({ key: "s" }, { f: [1, "x"] })).toBe('s:f=[1,"x"]');
  });
});
