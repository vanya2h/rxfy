import { RXFY_SESSION_HEADER } from "rxfy-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SessionModule = typeof import("./session.js");

/** Fresh module per test — getSessionId memoizes at module scope. */
async function loadSession(): Promise<SessionModule> {
  vi.resetModules();
  return import("./session.js");
}

const ssrGlobal = globalThis as { __RXFY_SSR__?: Array<{ session?: string }> };

beforeEach(() => {
  delete ssrGlobal.__RXFY_SSR__;
});

afterEach(() => {
  delete ssrGlobal.__RXFY_SSR__;
  vi.unstubAllGlobals();
});

describe("getSessionId", () => {
  it("adopts the session from the SSR hydration payload", async () => {
    ssrGlobal.__RXFY_SSR__ = [{}, { session: "ssr-session" }];
    const { getSessionId } = await loadSession();
    expect(getSessionId()).toBe("ssr-session");
  });

  it("returns undefined when there is no SSR payload — the server assigns one over the WebSocket", async () => {
    const { getSessionId } = await loadSession();
    expect(getSessionId()).toBeUndefined();
  });

  it("reads the SSR payload lazily — a payload appearing after import is still adopted", async () => {
    const { getSessionId } = await loadSession();
    ssrGlobal.__RXFY_SSR__ = [{ session: "late-ssr" }];
    expect(getSessionId()).toBe("late-ssr");
  });

  it("adoptSessionId installs the server-assigned id", async () => {
    const { adoptSessionId, getSessionId } = await loadSession();
    adoptSessionId("assigned-1");
    expect(getSessionId()).toBe("assigned-1");
  });
});

describe("sessionHeaders", () => {
  it("returns the session header for spreading into an HTTP client", async () => {
    ssrGlobal.__RXFY_SSR__ = [{ session: "ssr-session" }];
    const { sessionHeaders } = await loadSession();
    expect(sessionHeaders()).toEqual({ [RXFY_SESSION_HEADER]: "ssr-session" });
  });

  it("returns no header while the session is not yet known", async () => {
    const { sessionHeaders } = await loadSession();
    expect(sessionHeaders()).toEqual({});
  });
});

describe("withSession", () => {
  it("attaches the session header to a plain-URL request", async () => {
    ssrGlobal.__RXFY_SSR__ = [{ session: "ssr-session" }];
    const { withSession } = await loadSession();
    const seen: Array<{ input: Parameters<typeof fetch>[0]; init?: RequestInit }> = [];
    const fetchFn = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      seen.push({ input, init });
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;

    await withSession(fetchFn)("/api/todos");

    expect(seen).toHaveLength(1);
    expect(new Headers(seen[0]?.init?.headers).get(RXFY_SESSION_HEADER)).toBe("ssr-session");
  });

  it("keeps caller-provided init headers", async () => {
    ssrGlobal.__RXFY_SSR__ = [{ session: "ssr-session" }];
    const { withSession } = await loadSession();
    let sent: Headers | undefined;
    const fetchFn = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;

    await withSession(fetchFn)("/api/todos", { headers: { authorization: "Bearer t" } });

    expect(sent?.get("authorization")).toBe("Bearer t");
    expect(sent?.get(RXFY_SESSION_HEADER)).toBe("ssr-session");
  });

  it("keeps headers already set on a Request instance", async () => {
    ssrGlobal.__RXFY_SSR__ = [{ session: "ssr-session" }];
    const { withSession } = await loadSession();
    let sent: Headers | undefined;
    const fetchFn = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;

    await withSession(fetchFn)(new Request("http://localhost/api/todos", { headers: { "x-app": "1" } }));

    expect(sent?.get("x-app")).toBe("1");
    expect(sent?.get(RXFY_SESSION_HEADER)).toBe("ssr-session");
  });

  it("sends no header while the session is not yet known — the request is simply unrecorded", async () => {
    const { withSession } = await loadSession();
    let sent: Headers | undefined;
    const fetchFn = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      sent = new Headers(init?.headers);
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;

    await withSession(fetchFn)("/api/todos", { headers: { authorization: "Bearer t" } });

    expect(sent?.get(RXFY_SESSION_HEADER)).toBeNull();
    expect(sent?.get("authorization")).toBe("Bearer t");
  });

  it("defaults to the ambient fetch when none is given", async () => {
    ssrGlobal.__RXFY_SSR__ = [{ session: "ssr-session" }];
    const { withSession } = await loadSession();
    const ambient = vi.fn((..._args: Parameters<typeof fetch>) => Promise.resolve(new Response("ok")));
    vi.stubGlobal("fetch", ambient);

    await withSession()("/api/todos");

    expect(ambient).toHaveBeenCalledTimes(1);
    const init = ambient.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(init?.headers).get(RXFY_SESSION_HEADER)).toBe("ssr-session");
  });
});
