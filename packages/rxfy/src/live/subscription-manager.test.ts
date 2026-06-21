import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createModel } from "../model/model.js";
import { createSubscriptionManager } from "./subscription-manager.js";
import { modelTopic } from "./topic.js";

const TodoModel = createModel({ schema: z.object({ id: z.string() }), getKey: (t) => t.id, name: "todo" });
const t1 = modelTopic(TodoModel, "1");
const t2 = modelTopic(TodoModel, "2");

describe("createSubscriptionManager", () => {
  it("calls send with the topic on first want", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith([t1]);
  });

  it("does not call send on a duplicate want", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    mgr.want(t1);
    expect(send).toHaveBeenCalledOnce();
  });

  it("sends only the gap on subsequent wants", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    mgr.want(t2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, [t1]);
    expect(send).toHaveBeenNthCalledWith(2, [t2]);
  });

  it("does not call send when gap is empty", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    send.mockClear();
    mgr.want(t1); // early-return: already in desired set
    expect(send).not.toHaveBeenCalled();
  });

  it("reconnect replays full desired set", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.want(t1);
    mgr.want(t2);
    send.mockClear();
    mgr.reconnect();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith([t1, t2]);
  });

  it("reconnect is a no-op when desired is empty", () => {
    const send = vi.fn();
    const mgr = createSubscriptionManager(send);
    mgr.reconnect();
    expect(send).not.toHaveBeenCalled();
  });

  it("retries the topic on reconnect after send throws", () => {
    const send = vi.fn().mockImplementationOnce(() => {
      throw new Error("not connected");
    });
    const mgr = createSubscriptionManager(send);
    expect(() => mgr.want(t1)).toThrow("not connected");
    send.mockReset();
    mgr.reconnect(); // active was not advanced, so t1 is still in the gap
    expect(send).toHaveBeenCalledWith([t1]);
  });
});
