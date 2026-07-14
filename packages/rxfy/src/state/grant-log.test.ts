import { describe, expect, it } from "vitest";
import { createModelRegistry } from "../model/model-store.js";
import { createGrantLog } from "./grant-log.js";

describe("createGrantLog", () => {
  it("records grants and lists them", () => {
    const log = createGrantLog();
    log.add("g1");
    log.add("g2");
    expect(log.all().sort()).toEqual(["g1", "g2"]);
  });

  it("is idempotent — duplicate adds record once", () => {
    const log = createGrantLog();
    log.add("g1");
    log.add("g1");
    expect(log.all()).toEqual(["g1"]);
  });

  it("is exposed on the model registry", () => {
    const registry = createModelRegistry();
    registry.grants.add("g1");
    expect(registry.grants.all()).toEqual(["g1"]);
  });
});
