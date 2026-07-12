import { describe, expect, it } from "vitest";
import { signGrant, verifyGrant } from "./grant.js";

const secret = "test-secret";

describe("grant", () => {
  it("round-trips channel and expiry", () => {
    const token = signGrant({ channel: "todos|{}", secret, ttlMs: 60_000, now: () => 1_000_000 });
    expect(verifyGrant(token, { secret, now: () => 1_000_001 })).toEqual({
      channel: "todos|{}",
      exp: 1_060_000,
    });
  });

  it("rejects a tampered payload", () => {
    const token = signGrant({ channel: "a", secret, ttlMs: 60_000, now: () => 0 });
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ch: "b", exp: 9e12 })).toString("base64url");
    expect(verifyGrant(`${h}.${forged}.${s}`, { secret, now: () => 0 })).toBeNull();
  });

  it("rejects a wrong secret and garbage", () => {
    const token = signGrant({ channel: "a", secret, ttlMs: 60_000, now: () => 0 });
    expect(verifyGrant(token, { secret: "other", now: () => 0 })).toBeNull();
    expect(verifyGrant("not.a.jwt", { secret, now: () => 0 })).toBeNull();
  });

  it("rejects an expired grant, honoring the grace window", () => {
    const token = signGrant({ channel: "a", secret, ttlMs: 1_000, now: () => 0 });
    expect(verifyGrant(token, { secret, now: () => 1_001 })).toBeNull();
    expect(verifyGrant(token, { secret, now: () => 1_001, graceMs: 5_000 })).toEqual({ channel: "a", exp: 1_000 });
    expect(verifyGrant(token, { secret, now: () => 6_001, graceMs: 5_000 })).toBeNull();
  });
});
