import { createModelRegistry, normalizeResult } from "rxfy";
import { describe, expect, it } from "vitest";
import { postModel, userModel } from "./models";
import { seedComments, seedPosts, seedUsers } from "./seed";
import { postDetailState, postsState } from "./states";

describe("shared blog data", () => {
  it("seed content is present and consistent", () => {
    expect(seedPosts).toHaveLength(5);
    expect(seedUsers).toHaveLength(3);
    for (const p of seedPosts) expect(seedUsers.some((u) => u.id === p.userId)).toBe(true);
    for (const c of seedComments) expect(seedPosts.some((p) => p.id === c.postId)).toBe(true);
  });

  it("postsState normalizes to id lists + plain meta", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, postsState.fields, {
      posts: seedPosts,
      authors: seedUsers,
      meta: { total: seedPosts.length, generatedAt: "t" },
    });
    expect(ids.posts).toEqual(["1", "2", "3", "4", "5"]);
    expect(ids.authors).toEqual(["1", "2", "3"]);
    expect(ids.meta).toEqual({ total: 5, generatedAt: "t" });
    expect(registry.model(postModel).getValue("1")).toMatchObject({ title: "Getting Started with rxfy" });
    expect(registry.model(userModel).getValue("1")).toMatchObject({ name: "Alice Doe" });
  });

  it("postDetailState normalizes single + array fields to ids", () => {
    const registry = createModelRegistry();
    const ids = normalizeResult(registry, postDetailState.fields, {
      post: seedPosts[0],
      author: seedUsers[0],
      comments: seedComments.filter((c) => c.postId === ("1" as typeof c.postId)),
    });
    expect(ids.post).toBe("1");
    expect(ids.author).toBe("1");
    expect(ids.comments).toEqual(["1", "2"]);
  });
});
