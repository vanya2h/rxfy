import { describe, expect, it } from "vitest";
import { patch, PROTOCOL_VERSION, stale, subscribe } from "./messages.js";

describe("PROTOCOL_VERSION", () => {
  it("is the literal 2", () => {
    expect(PROTOCOL_VERSION).toBe(2);
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

  it("subscribe frame carries only the grant", () => {
    expect(subscribe("jwt.token.here")).toEqual({
      v: PROTOCOL_VERSION,
      kind: "subscribe",
      grant: "jwt.token.here",
    });
  });
});
