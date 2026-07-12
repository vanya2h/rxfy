import { stale } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { createInMemoryHub } from "./hub.js";

const msg = stale("todos");

describe("createInMemoryHub", () => {
  it("delivers a publish to every subscribed connection", () => {
    const hub = createInMemoryHub();
    const seen: number[] = [];
    hub.onPublish((conn) => seen.push(conn));
    hub.subscribe(1, ["c:todos"], Date.now() + 60_000);
    hub.subscribe(2, ["c:todos"], Date.now() + 60_000);
    hub.publish("c:todos", msg);
    expect(seen.sort()).toEqual([1, 2]);
  });

  it("delivers to subscribed connections until expiry", () => {
    const hub = createInMemoryHub({ now: () => clock });
    let clock = 0;
    const seen: Array<[number, unknown]> = [];
    hub.onPublish((conn, msg) => seen.push([conn, msg]));
    hub.subscribe(1, ["c:todos"], 1_000);
    hub.publish("c:todos", stale("todos"));
    clock = 1_001;
    hub.publish("c:todos", stale("todos"));
    expect(seen).toHaveLength(1);
  });

  it("re-subscribe extends expiry in place", () => {
    let clock = 0;
    const hub = createInMemoryHub({ now: () => clock });
    const seen: unknown[] = [];
    hub.onPublish((_conn, msg) => seen.push(msg));
    hub.subscribe(1, ["c:todos"], 1_000);
    clock = 900;
    hub.subscribe(1, ["c:todos"], 2_000);
    clock = 1_500;
    hub.publish("c:todos", stale("todos"));
    expect(seen).toHaveLength(1);
  });

  it("drop removes every subscription of a connection", () => {
    const hub = createInMemoryHub();
    const seen: unknown[] = [];
    hub.onPublish((_conn, msg) => seen.push(msg));
    hub.subscribe(1, ["c:todos", "e:todo:1"], Date.now() + 60_000);
    hub.drop(1);
    hub.publish("c:todos", stale("todos"));
    hub.publish("e:todo:1", stale("x"));
    expect(seen).toHaveLength(0);
  });
});
