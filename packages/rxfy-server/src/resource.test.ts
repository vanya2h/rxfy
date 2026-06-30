import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { defineResource, primaryKeyColumn } from "./resource.js";

const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  views: integer("views").notNull().default(0),
});

const widgets = pgTable("widgets", {
  sku: text("sku").primaryKey(),
  label: text("label").notNull(),
});

const logs = pgTable("logs", {
  message: text("message").notNull(),
});

const memberships = pgTable(
  "memberships",
  {
    userId: text("user_id").notNull(),
    orgId: text("org_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] })],
);

describe("primaryKeyColumn", () => {
  it("returns the single PK column's JS name", () => {
    expect(primaryKeyColumn(posts)).toBe("id");
    expect(primaryKeyColumn(widgets)).toBe("sku");
  });

  it("throws when there is no primary key", () => {
    expect(() => primaryKeyColumn(logs)).toThrow(/primary key/i);
  });

  it("throws for a composite primary key", () => {
    expect(() => primaryKeyColumn(memberships)).toThrow(/composite|multiple|single/i);
  });
});

describe("defineResource", () => {
  it("defaults the model name to the SQL table name", () => {
    const r = defineResource({ table: posts, name: "posts" });
    expect(r.name).toBe("posts");
    expect(r.model.name).toBe("posts");
  });

  it("honors an explicit name override", () => {
    const r = defineResource({ table: posts, name: "post" });
    expect(r.name).toBe("post");
    expect(r.model.name).toBe("post");
  });

  it("derives a getKey that reads the primary-key column", () => {
    const r = defineResource({ table: posts });
    expect(r.getKey({ id: "1", orgId: "o", title: "t", views: 0 })).toBe("1");
    expect(r.primaryKeyColumn).toBe("id");
  });

  it("supports a non-id primary key", () => {
    const r = defineResource({ table: widgets });
    expect(r.getKey({ sku: "S1", label: "L" })).toBe("S1");
    expect(r.model.getKey({ sku: "S2", label: "L2" })).toBe("S2");
  });

  it("produces a working zod v4 schema that validates rows", () => {
    const r = defineResource({ table: posts });
    const row = { id: "1", orgId: "o", title: "t", views: 5 };
    expect(r.zod.parse(row)).toEqual(row);
    expect(() => r.zod.parse({ id: "1", orgId: "o", title: "t", views: "nope" })).toThrow();
  });

  it("exposes the table on the resource", () => {
    const r = defineResource({ table: posts });
    expect(r.table).toBe(posts);
  });

  it("throws when the table has no single primary key", () => {
    expect(() => defineResource({ table: logs })).toThrow(/primary key/i);
  });

  it("throws for a composite primary key", () => {
    expect(() => defineResource({ table: memberships })).toThrow(/composite|multiple|single/i);
  });
});
