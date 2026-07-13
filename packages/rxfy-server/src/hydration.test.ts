import { createModelRegistry } from "rxfy";
import { describe, expect, it } from "vitest";
import { grantsHydration } from "./hydration.js";

describe("grantsHydration", () => {
  it("embeds the registry's logged grants verbatim", () => {
    const registry = createModelRegistry();
    registry.grants.add("grant-A");
    registry.grants.add("grant-B");

    const script = grantsHydration(registry);
    expect(script).toContain("__RXFY_SSR__");
    expect(script).toContain('"grants"');

    const grants = JSON.parse(/"grants":(\[[^\]]*\])/.exec(script)![1]!) as string[];
    expect(grants).toEqual(["grant-A", "grant-B"]);
  });

  it("emits no grants when nothing was logged", () => {
    const registry = createModelRegistry();

    const script = grantsHydration(registry);
    const grants = JSON.parse(/"grants":(\[[^\]]*\])/.exec(script)![1]!) as string[];
    expect(grants).toEqual([]);
  });
});
