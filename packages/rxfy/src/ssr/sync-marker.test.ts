import { of } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { attachReload, getAttachedReload, isSyncMarked, markSync } from "./sync-marker.js";

describe("sync-marker", () => {
  it("markSync marks and returns the same object", () => {
    const obs = of(1);
    expect(isSyncMarked(obs)).toBe(false);
    expect(markSync(obs)).toBe(obs);
    expect(isSyncMarked(obs)).toBe(true);
  });

  it("attachReload stores a retrievable callback", () => {
    const obs = of(1);
    const reload = vi.fn();
    expect(getAttachedReload(obs)).toBeUndefined();
    expect(attachReload(obs, reload)).toBe(obs);
    getAttachedReload(obs)?.();
    expect(reload).toHaveBeenCalledOnce();
  });
});
