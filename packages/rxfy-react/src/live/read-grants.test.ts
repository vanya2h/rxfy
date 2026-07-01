import { afterEach, describe, expect, it } from "vitest";
import { readSsrGrants } from "./read-grants.js";

afterEach(() => {
  delete (globalThis as { __RXFY_SSR__?: unknown }).__RXFY_SSR__;
});

describe("readSsrGrants", () => {
  it("returns empty maps when no SSR payload is present", () => {
    expect(readSsrGrants()).toEqual({ entities: {}, channels: {} });
  });

  it("merges grants across chunks (last-writer-wins)", () => {
    (globalThis as { __RXFY_SSR__?: unknown }).__RXFY_SSR__ = [
      { grants: { entities: { "post:1": "a" }, channels: { "posts:orgId=A": "c1" } } },
      { grants: { entities: { "post:2": "b", "post:1": "a2" }, channels: {} } },
    ];
    expect(readSsrGrants()).toEqual({
      entities: { "post:1": "a2", "post:2": "b" },
      channels: { "posts:orgId=A": "c1" },
    });
  });

  it("tolerates chunks without grants", () => {
    (globalThis as { __RXFY_SSR__?: unknown }).__RXFY_SSR__ = [
      { queries: {}, models: {} },
      { grants: { entities: { x: "1" } } },
    ];
    expect(readSsrGrants()).toEqual({ entities: { x: "1" }, channels: {} });
  });
});
