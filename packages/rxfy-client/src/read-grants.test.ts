import { afterEach, describe, expect, it } from "vitest";
import { readSsrGrants } from "./read-grants.js";

type SsrGlobal = { __RXFY_SSR__?: Array<{ grants?: string[] }> };

afterEach(() => {
  delete (globalThis as SsrGlobal).__RXFY_SSR__;
});

describe("readSsrGrants", () => {
  it("returns an empty array with no hydration chunks", () => {
    expect(readSsrGrants()).toEqual([]);
  });

  it("flattens every chunk's grants in order", () => {
    (globalThis as SsrGlobal).__RXFY_SSR__ = [{ grants: ["a", "b"] }, {}, { grants: ["c"] }];
    expect(readSsrGrants()).toEqual(["a", "b", "c"]);
  });
});
