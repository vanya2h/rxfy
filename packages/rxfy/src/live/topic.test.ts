import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { createModel } from "../model/model.js";
import { modelTopic, type Topic } from "./topic.js";

const TodoModel = createModel({ schema: z.object({ id: z.string() }), getKey: (t) => t.id, name: "todo" });

describe("modelTopic", () => {
  it("returns name:id string", () => {
    expect(modelTopic(TodoModel, "u1")).toBe("todo:u1");
  });

  it("Topic type is a branded string", () => {
    expectTypeOf(modelTopic(TodoModel, "u1")).toEqualTypeOf<Topic>();
  });
});
