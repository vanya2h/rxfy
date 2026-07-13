import superjson from "superjson";
import { describe, expect, it } from "vitest";
import { parseClientMessage, parseServerMessage, ProtocolError, serialize } from "./codec.js";
import { patch, PROTOCOL_VERSION, stale, subscribe } from "./messages.js";

describe("serialize + parseServerMessage round-trip", () => {
  it("round-trips a patch message", () => {
    const msg = patch("post", "1", { title: "A" });
    expect(parseServerMessage(serialize(msg))).toEqual(msg);
  });

  it("round-trips a stale message", () => {
    const msg = stale("posts:orgId=A");
    expect(parseServerMessage(serialize(msg))).toEqual(msg);
  });

  it("preserves Date values in patch data across the wire", () => {
    const createdAt = new Date("2024-01-01T12:00:00.000Z");
    const msg = patch("post", "1", { title: "A", createdAt });
    const parsed = parseServerMessage(serialize(msg));
    const data = (parsed as { data: { createdAt: unknown } }).data;
    expect(data.createdAt).toBeInstanceOf(Date);
    expect((data.createdAt as Date).getTime()).toBe(createdAt.getTime());
  });
});

describe("parseServerMessage rejects invalid input", () => {
  it("rejects malformed JSON", () => {
    expect(() => parseServerMessage("{not json")).toThrow(ProtocolError);
  });

  it("rejects a non-object payload", () => {
    expect(() => parseServerMessage(superjson.stringify(42))).toThrow(ProtocolError);
  });

  it("rejects an unsupported version", () => {
    expect(() => parseServerMessage(superjson.stringify({ v: 1, kind: "stale", channel: "c" }))).toThrow(
      /unsupported protocol version/,
    );
  });

  it("rejects an unknown kind", () => {
    expect(() => parseServerMessage(superjson.stringify({ v: 2, kind: "nope" }))).toThrow(
      /unknown server message kind/,
    );
  });

  it("rejects a patch with missing fields", () => {
    expect(() => parseServerMessage(superjson.stringify({ v: 2, kind: "patch", name: "post" }))).toThrow(ProtocolError);
  });

  it("rejects a stale with a non-string channel", () => {
    expect(() => parseServerMessage(superjson.stringify({ v: 2, kind: "stale", channel: 5 }))).toThrow(ProtocolError);
  });

  it("rejects a client frame (subscribe) as a server message", () => {
    expect(() => parseServerMessage(serialize(subscribe("g")))).toThrow(/unknown server message kind/);
  });

  it("rejects a top-level array with the object error", () => {
    expect(() => parseServerMessage(superjson.stringify([1, 2, 3]))).toThrow(/message must be an object/);
  });
});

describe("serialize + parseClientMessage round-trip", () => {
  it("round-trips a subscribe frame with just a grant", () => {
    const msg = subscribe("jwt.token.here");
    expect(parseClientMessage(serialize(msg))).toEqual({
      v: PROTOCOL_VERSION,
      kind: "subscribe",
      grant: "jwt.token.here",
    });
  });

  it("rejects a subscribe frame without a string grant", () => {
    const raw = serialize({ v: PROTOCOL_VERSION, kind: "subscribe", grant: 42 } as never);
    expect(() => parseClientMessage(raw)).toThrow(/string `grant`/);
  });

  it("no longer accepts hello or session frames", () => {
    expect(() => parseClientMessage(serialize({ v: PROTOCOL_VERSION, kind: "hello" } as never))).toThrow(ProtocolError);
    expect(() =>
      parseServerMessage(serialize({ v: PROTOCOL_VERSION, kind: "session", session: "s" } as never)),
    ).toThrow(ProtocolError);
  });
});

describe("parseClientMessage rejects invalid input", () => {
  it("rejects a server frame (stale) as a client message", () => {
    expect(() => parseClientMessage(serialize(stale("c")))).toThrow(/unknown client message kind/);
  });
});
