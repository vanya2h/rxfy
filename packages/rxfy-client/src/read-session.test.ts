import { afterEach, describe, expect, it } from "vitest";
import { readSsrSession } from "./read-session.js";

type SsrGlobal = { __RXFY_SSR__?: Array<{ session?: string }> };

afterEach(() => {
  delete (globalThis as SsrGlobal).__RXFY_SSR__;
});

describe("readSsrSession", () => {
  it("returns undefined with no hydration chunks", () => {
    expect(readSsrSession()).toBeUndefined();
  });

  it("returns the first session found in the chunks", () => {
    (globalThis as SsrGlobal).__RXFY_SSR__ = [{}, { session: "sess-1" }, { session: "sess-2" }];
    expect(readSsrSession()).toBe("sess-1");
  });
});
