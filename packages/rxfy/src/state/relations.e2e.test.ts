import { describe, expect, it } from "vitest";
import { z } from "zod";
import { array, createModel, ref, single } from "../model/model.js";
import { createModelRegistry } from "../model/model-store.js";
import { normalizeResult } from "./normalize.js";

const cat = createModel({
  schema: z.object({ id: z.string(), name: z.string() }),
  getKey: (c) => c.id,
  name: "e2e-cat",
});
const post = createModel({
  schema: z.object({ id: z.string(), title: z.string(), categoryId: z.string(), category: ref(cat) }),
  getKey: (p) => p.id,
  name: "e2e-post",
});

describe("list and detail feed one shared store", () => {
  it("list stores refs only; detail joins the category into the same post cell", () => {
    const reg = createModelRegistry();

    // LIST fetch — no join. Post carries only categoryId.
    normalizeResult(reg, { posts: array(post) }, {
      posts: [{ id: "p1", title: "A", categoryId: "c1" }],
    } as never);
    expect(reg.model(post).getValue("p1")).toEqual({ id: "p1", title: "A", categoryId: "c1" });
    expect(reg.model(cat).getValue("c1")).toBeUndefined(); // not loaded on the list

    // DETAIL fetch — joins category into the SAME post store.
    normalizeResult(reg, { post: single(post).with({ category: true }) }, {
      post: { id: "p1", title: "A", categoryId: "c1", category: { id: "c1", name: "News" } },
    } as never);
    expect(reg.model(post).getValue("p1")).toEqual({ id: "p1", title: "A", categoryId: "c1", category: "c1" });
    expect(reg.model(cat).getValue("c1")).toEqual({ id: "c1", name: "News" }); // now present
  });
});
