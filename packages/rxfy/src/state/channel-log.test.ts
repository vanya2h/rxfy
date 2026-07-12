import { describe, expect, it } from "vitest";
import { createModelRegistry } from "../model/model-store.js";
import { createChannelLog } from "./channel-log.js";

describe("createChannelLog", () => {
  it("records channels and lists them", () => {
    const log = createChannelLog();
    log.add("todos");
    log.add("posts:author=7");
    expect(log.all().sort()).toEqual(["posts:author=7", "todos"]);
  });

  it("is idempotent — duplicate adds record once", () => {
    const log = createChannelLog();
    log.add("todos");
    log.add("todos");
    expect(log.all()).toEqual(["todos"]);
  });

  it("is exposed on the model registry", () => {
    const registry = createModelRegistry();
    registry.channels.add("todos");
    expect(registry.channels.all()).toEqual(["todos"]);
  });
});
