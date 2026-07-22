import { describe, expect, it } from "vitest";
import * as rxfy from "./index.js";

describe("public API", () => {
  it("exports the new relations surface", () => {
    for (const name of ["ref", "refArray", "asKey", "single", "array", "createModel"]) {
      expect(typeof (rxfy as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
