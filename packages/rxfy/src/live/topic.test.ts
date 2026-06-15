import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createModel } from "../model/model.js";
import { modelTopic, type Topic } from "./topic.js";

const TodoModel = createModel(z.object({ id: z.string() }), { getKey: (t) => t.id, name: "todo" });
const UnnamedModel = createModel(z.object({ id: z.string() }), { getKey: (t) => t.id });

describe("modelTopic", () => {
  it("returns name:id string", () => {
    expect(modelTopic(TodoModel, "u1")).toBe("todo:u1");
  });

  it("Topic type is a branded string", () => {
    expectTypeOf(modelTopic(TodoModel, "u1")).toEqualTypeOf<Topic>();
  });

  it("throws when model has no name", () => {
    expect(() => modelTopic(UnnamedModel, "u1")).toThrow(
      "rxfy: modelTopic requires a named model",
    );
  });
});
