import { createModelRegistry, normalizeResult } from "rxfy";
import { describe, expect, it } from "vitest";
import { commentModel, postModel, userModel } from "./models";
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

  it("postDetailState normalizes the recursive join (post → comments → author) into stores", () => {
    const registry = createModelRegistry();
    const post = seedPosts[0];
    const author = seedUsers.find((u) => u.id === post.userId)!;
    const comments = seedComments
      .filter((c) => c.postId === ("1" as typeof c.postId))
      .map((c) => ({ ...c, author: seedUsers.find((u) => u.id === c.userId)! }));
    const ids = normalizeResult(registry, postDetailState.fields, { post: { ...post, author, comments } });

    // The query shape holds only the post id; the joined author + comments resolve into the stores.
    expect(ids.post).toBe("1");
    const stored = registry.model(postModel).getValue("1");
    expect(stored?.author).toBe("1"); // the post's joined author, mirrored to a store key
    expect(stored?.comments).toEqual(["1", "2"]); // the joined comment store keys
    // Each comment's own joined author landed in the user store and is keyed on the comment.
    expect(registry.model(commentModel).getValue("1")?.author).toBe("2");
    expect(registry.model(userModel).getValue("2")).toMatchObject({ name: "Bob Smith" });
    expect(registry.model(userModel).getValue("3")).toMatchObject({ name: "Carol Lee" });
  });
});
