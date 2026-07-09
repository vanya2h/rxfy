import { describe, expect, it } from "vitest";
import { hello, patch, PROTOCOL_VERSION, session, stale } from "./messages.js";

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

  it("hello carries the session id", () => {
    expect(hello("sess-1")).toEqual({ v: 2, kind: "hello", session: "sess-1" });
  });

  it("hello without a session omits the field — asks the server to assign one", () => {
    expect(hello()).toEqual({ v: 2, kind: "hello" });
  });

  it("session carries the server-assigned id", () => {
    expect(session("sess-1")).toEqual({ v: 2, kind: "session", session: "sess-1" });
  });
});
