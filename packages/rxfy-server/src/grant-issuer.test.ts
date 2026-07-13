import { array, createModel, createModelRegistry, defineState, stateChannel } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { verifyGrant } from "./grant.js";
import { createGrantIssuer } from "./grant-issuer.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

const postsState = defineState({ key: "posts", params: z.object({}), model: { posts: array(postModel) } });

describe("createGrantIssuer", () => {
  it("serve parses the payload and signs a grant carrying the channel + entities", () => {
    const issuer = createGrantIssuer({ secret: "s", grantTtlMs: 60_000 });
    const served = issuer.serve(postsState, {}, { posts: [{ id: "p1", title: "a", extra: "stripped" }] });
    expect(served.posts).toEqual([{ id: "p1", title: "a" }]); // parsed: unknown keys stripped
    const claims = verifyGrant(served.$grant, { secret: "s" });
    expect(claims?.channel).toBe(stateChannel(postsState, {}));
    expect(claims?.entities).toEqual(["post:p1"]);
  });

  it("renew reissues the same channel + entities and rejects garbage", () => {
    const issuer = createGrantIssuer({ secret: "s" });
    const { $grant } = issuer.serve(postsState, {}, { posts: [{ id: "p1", title: "a" }] });
    const renewed = issuer.renew($grant)!;
    expect(renewed).not.toBeNull();
    const claims = verifyGrant(renewed, { secret: "s" });
    expect(claims?.channel).toBe(stateChannel(postsState, {}));
    expect(claims?.entities).toEqual(["post:p1"]);
    expect(issuer.renew("garbage")).toBeNull();
  });

  it("hydration embeds the registry's logged grants verbatim", () => {
    const issuer = createGrantIssuer({ secret: "s" });
    const registry = createModelRegistry();
    registry.grants.add("grant-A");
    const script = issuer.hydration(registry);
    expect(script).toContain("grant-A");
  });
});
