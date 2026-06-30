import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, patch, stale, subscribe, unsubscribe } from "./messages.js";

describe("PROTOCOL_VERSION", () => {
  it("is the literal 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe("message constructors", () => {
  it("patch sets version, kind, and fields", () => {
    expect(patch("post", "1", { id: "1", title: "A" })).toEqual({
      v: PROTOCOL_VERSION,
      kind: "patch",
      name: "post",
      id: "1",
      data: { id: "1", title: "A" },
    });
  });

  it("stale sets version, kind, and channel", () => {
    expect(stale("posts:orgId=A")).toEqual({
      v: PROTOCOL_VERSION,
      kind: "stale",
      channel: "posts:orgId=A",
    });
  });

  it("subscribe carries ids", () => {
    expect(subscribe(["a", "b"])).toEqual({
      v: PROTOCOL_VERSION,
      kind: "subscribe",
      ids: ["a", "b"],
    });
  });

  it("unsubscribe carries ids", () => {
    expect(unsubscribe(["a"])).toEqual({
      v: PROTOCOL_VERSION,
      kind: "unsubscribe",
      ids: ["a"],
    });
  });
});
