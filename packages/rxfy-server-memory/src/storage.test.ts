import { createModel } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCollection } from "./collection.js";
import { memoryStorage } from "./storage.js";

const model = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

describe("memoryStorage + defineCollection", () => {
  it("create / update / delete mutate the collection map", async () => {
    const posts = defineCollection({ name: "post", model, seed: [{ id: "p0", title: "seed" }] });
    const storage = memoryStorage();
    expect(posts.all()).toEqual([{ id: "p0", title: "seed" }]);

    const created = await storage.create(posts.binding, { id: "p1", title: "Hi" });
    expect(created).toEqual({ id: "p1", title: "Hi" });
    expect(posts.get("p1")).toEqual({ id: "p1", title: "Hi" });

    const updated = await storage.update(posts.binding, "p1", { title: "New" });
    expect(updated).toEqual({ id: "p1", title: "New" });
    expect(await storage.update(posts.binding, "nope", { title: "x" })).toBeUndefined();

    await storage.delete(posts.binding, "p1");
    expect(posts.get("p1")).toBeUndefined();
  });
});
