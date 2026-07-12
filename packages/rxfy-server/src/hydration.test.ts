import { array, createModel, createModelRegistry, normalizeResult } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { verifyGrant } from "./grant.js";
import { grantsHydration } from "./hydration.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

describe("grantsHydration", () => {
  it("signs a verifiable grant per logged channel and embeds them in the script", () => {
    const registry = createModelRegistry();
    normalizeResult(registry, { posts: array(postModel) }, { posts: [{ id: "1", title: "a" }] });
    registry.channels.add("posts");

    const script = grantsHydration(registry, { secret: "s" });
    expect(script).toContain("__RXFY_SSR__");
    expect(script).toContain('"grants"');

    const grants = JSON.parse(/"grants":(\[[^\]]*\])/.exec(script)![1]!) as string[];
    expect(grants).toHaveLength(1);
    expect(verifyGrant(grants[0]!, { secret: "s" })?.channel).toBe("posts");
  });

  it("emits no grants when nothing was logged", () => {
    const registry = createModelRegistry();
    normalizeResult(registry, { posts: array(postModel) }, { posts: [{ id: "1", title: "a" }] });

    const script = grantsHydration(registry, { secret: "s" });
    const grants = JSON.parse(/"grants":(\[[^\]]*\])/.exec(script)![1]!) as string[];
    expect(grants).toEqual([]);
  });
});
