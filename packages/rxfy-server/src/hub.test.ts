import { stale } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { createInMemoryHub } from "./hub.js";

const msg = stale("todos");

describe("createInMemoryHub", () => {
  it("delivers a publish to every subscribed session", () => {
    const hub = createInMemoryHub();
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["c:todos"]);
    hub.subscribe("s2", ["c:todos"]);
    hub.publish("c:todos", msg);
    expect(seen.sort()).toEqual(["s1", "s2"]);
  });

  it("unsubscribe stops delivery for that id only", () => {
    const hub = createInMemoryHub();
    const seen: string[] = [];
    hub.onPublish((_s, m) => seen.push(m.kind));
    hub.subscribe("s1", ["a", "b"]);
    hub.unsubscribe("s1", ["a"]);
    hub.publish("a", msg);
    hub.publish("b", msg);
    expect(seen).toEqual(["stale"]);
  });

  it("drop removes all of a session's subscriptions", () => {
    const hub = createInMemoryHub();
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a", "b"]);
    hub.drop("s1");
    hub.publish("a", msg);
    hub.publish("b", msg);
    expect(seen).toEqual([]);
  });

  it("expires an unbound session after ttlMs", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a"]); // never binds (e.g. SSR session whose client never arrived)
    t = 99;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]);
    t = 100;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]); // expired — no second delivery
  });

  it("a bound session never expires; release restarts the clock", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a"]);
    hub.bind("s1");
    t = 1_000_000;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]); // bound: still alive
    hub.release("s1");
    t += 99;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1", "s1"]); // within ttl after release
    t += 1;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1", "s1"]); // ttl elapsed — dropped
  });

  it("re-bind after release cancels expiry (reconnect)", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a"]);
    hub.bind("s1");
    hub.release("s1");
    t = 50;
    hub.bind("s1"); // reconnected in time
    t = 1_000_000;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]);
  });

  it("subscribing again refreshes an unbound session's ttl", () => {
    let t = 0;
    const hub = createInMemoryHub({ ttlMs: 100, now: () => t });
    const seen: string[] = [];
    hub.onPublish((session) => seen.push(session));
    hub.subscribe("s1", ["a"]);
    t = 90;
    hub.subscribe("s1", ["b"]); // activity restarts the clock
    t = 150;
    hub.publish("a", msg);
    expect(seen).toEqual(["s1"]);
  });
});
