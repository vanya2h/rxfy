import { array, createModel, createModelRegistry, normalizeResult } from "rxfy";
import { stale } from "rxfy-protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createInMemoryHub } from "./hub.js";
import { hubHydration } from "./hydration.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

describe("hubHydration", () => {
  it("mints a session, subscribes it to the registry's channels, and embeds the session in the script", () => {
    const hub = createInMemoryHub();
    const registry = createModelRegistry();
    normalizeResult(registry, { posts: array(postModel) }, { posts: [{ id: "1", title: "a" }] });
    registry.channels.add("posts");

    const script = hubHydration(hub, registry);
    expect(script).toContain("__RXFY_SSR__");

    const session = /"session":"([^"]+)"/.exec(script)?.[1];
    expect(session).toBeTruthy();

    const seen: string[] = [];
    hub.onPublish((s) => seen.push(s));
    hub.publish("c:posts", stale("posts"));
    expect(seen).toEqual([session]);
  });

  it("subscribes extra subscription ids under the same session", () => {
    const hub = createInMemoryHub();
    const registry = createModelRegistry();
    registry.channels.add("posts");

    const script = hubHydration(hub, registry, ["e:post:1"]);
    const session = /"session":"([^"]+)"/.exec(script)?.[1];

    const seen: string[] = [];
    hub.onPublish((s) => seen.push(s));
    hub.publish("e:post:1", stale("x"));
    hub.publish("c:posts", stale("posts"));
    expect(seen).toEqual([session, session]);
  });

  it("does not subscribe entities on its own — channel subscriptions only", () => {
    const hub = createInMemoryHub();
    const registry = createModelRegistry();
    normalizeResult(registry, { posts: array(postModel) }, { posts: [{ id: "1", title: "a" }] });

    hubHydration(hub, registry);

    const seen: string[] = [];
    hub.onPublish((s) => seen.push(s));
    hub.publish("e:post:1", stale("x"));
    expect(seen).toEqual([]);
  });
});
