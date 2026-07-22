import { createModel, defineState, ref, single } from "rxfy";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { verifyGrant } from "./grant.js";
import { createInMemoryHub } from "./hub.js";
import type { SyncStorage } from "./storage.js";
import { createSync } from "./sync.js";

const cat = createModel({
  schema: z.object({ id: z.string(), name: z.string() }),
  getKey: (c) => c.id,
  name: "e2ecat",
});
const post = createModel({
  schema: z.object({
    id: z.string(),
    title: z.string(),
    categoryId: z.string(),
    category: ref(cat),
  }),
  getKey: (p) => p.id,
  name: "e2epost",
  fk: { category: "categoryId" },
});
const postState = defineState({
  key: "post",
  params: z.object({ id: z.string() }),
  model: { post: single(post).with({ category: true }) },
});

function fakeStorage(): SyncStorage<{ name: string }> {
  return {
    create: vi.fn(async (_b, v) => v),
    update: vi.fn(async (_b, id, v) => ({ id, ...(v as object) })),
    delete: vi.fn(async () => {}),
  };
}

describe("sync.serve with a joined relation", () => {
  it("returns the cleaned nested entity and a grant enumerating the nested topic", () => {
    const sync = createSync({ storage: fakeStorage(), hub: createInMemoryHub(), secret: "s" });
    const served = sync.serve(
      postState,
      { id: "p1" },
      {
        post: { id: "p1", title: "T", categoryId: "c1", category: { id: "c1", name: "News", extra: "stripped" } },
      },
    );
    expect(served.post.category).toEqual({ id: "c1", name: "News" }); // nested, unknown key stripped
    const claims = verifyGrant(served.$grant, { secret: "s" });
    expect(claims?.entities).toContain("e2epost:p1");
    expect(claims?.entities).toContain("e2ecat:c1");
  });
});
