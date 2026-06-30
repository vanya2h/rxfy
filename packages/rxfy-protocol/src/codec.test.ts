import { describe, expect, it } from "vitest";
import { parseServerMessage, ProtocolError, serialize } from "./codec.js";
import { patch, stale, subscribe } from "./messages.js";

describe("serialize + parseServerMessage round-trip", () => {
  it("round-trips a patch message", () => {
    const msg = patch("post", "1", { title: "A" });
    expect(parseServerMessage(serialize(msg))).toEqual(msg);
  });

  it("round-trips a stale message", () => {
    const msg = stale("posts:orgId=A");
    expect(parseServerMessage(serialize(msg))).toEqual(msg);
  });
});

describe("parseServerMessage rejects invalid input", () => {
  it("rejects malformed JSON", () => {
    expect(() => parseServerMessage("{not json")).toThrow(ProtocolError);
  });

  it("rejects a non-object payload", () => {
    expect(() => parseServerMessage("42")).toThrow(ProtocolError);
  });

  it("rejects an unsupported version", () => {
    expect(() => parseServerMessage(JSON.stringify({ v: 2, kind: "stale", channel: "c" }))).toThrow(
      /unsupported protocol version/,
    );
  });

  it("rejects an unknown kind", () => {
    expect(() => parseServerMessage(JSON.stringify({ v: 1, kind: "nope" }))).toThrow(/unknown server message kind/);
  });

  it("rejects a patch with missing fields", () => {
    expect(() => parseServerMessage(JSON.stringify({ v: 1, kind: "patch", name: "post" }))).toThrow(ProtocolError);
  });

  it("rejects a stale with a non-string channel", () => {
    expect(() => parseServerMessage(JSON.stringify({ v: 1, kind: "stale", channel: 5 }))).toThrow(ProtocolError);
  });

  it("rejects a client frame (subscribe) as a server message", () => {
    expect(() => parseServerMessage(serialize(subscribe(["a"])))).toThrow(/unknown server message kind/);
  });

  it("rejects a top-level array with the object error", () => {
    expect(() => parseServerMessage("[1,2,3]")).toThrow(/message must be an object/);
  });
});
