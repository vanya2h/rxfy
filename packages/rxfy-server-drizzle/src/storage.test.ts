import { pgTable, text } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { defineResource } from "./resource.js";
import { drizzleStorage } from "./storage.js";

const postsTable = pgTable("posts", { id: text("id").primaryKey(), title: text("title").notNull() });

async function db() {
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite();
  await client.exec(`CREATE TABLE posts (id text PRIMARY KEY, title text NOT NULL);`);
  return drizzle(client);
}

describe("drizzleStorage", () => {
  it("create / update / delete round-trip through the binding", async () => {
    const storage = drizzleStorage(await db());
    const posts = defineResource({ table: postsTable });

    const created = await storage.create(posts.binding, { id: "p1", title: "Hi" });
    expect(created).toMatchObject({ id: "p1", title: "Hi" });

    const updated = await storage.update(posts.binding, "p1", { title: "New" });
    expect(updated).toMatchObject({ id: "p1", title: "New" });

    expect(await storage.update(posts.binding, "nope", { title: "x" })).toBeUndefined();

    await storage.delete(posts.binding, "p1");
    expect(await storage.update(posts.binding, "p1", { title: "y" })).toBeUndefined();
  });

  it("defineResource derives the model + binding", () => {
    const posts = defineResource({ table: postsTable });
    expect(posts.name).toBe("posts");
    expect(posts.getKey({ id: "p1", title: "x" })).toBe("p1");
    expect(posts.binding.pkColumn).toBe("id");
  });
});
