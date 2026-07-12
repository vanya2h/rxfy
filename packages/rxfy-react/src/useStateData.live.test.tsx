import { renderHook } from "@testing-library/react";
import { array, createModel, defineState } from "rxfy";
import type { LiveClient } from "rxfy-client";
import { BehaviorSubject, firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useStateData } from "./useStateData.js";

const postModel = createModel({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (x) => x.id,
  name: "post",
});

const pageState = defineState({
  key: "page",
  params: z.object({ page: z.number() }),
  window: ["page"],
  model: { posts: array(postModel) },
});

/** A controllable stub live client whose single channel is backed by a BehaviorSubject. */
function stubLive() {
  const counter = new BehaviorSubject(0);
  const reset = vi.fn(() => counter.next(0));
  const channel = vi.fn(() => ({ available$: counter.asObservable(), reset }));
  const subscribed: { grant: string; entities: string[] }[] = [];
  const subscribe = vi.fn((grant: string, entities: string[]) => {
    subscribed.push({ grant, entities });
  });
  const client: LiveClient = { subscribe, channel, stop: vi.fn() };
  return { client, counter, reset, channel, subscribe, subscribed };
}

const withLive = (client: LiveClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <StoreProvider liveClient={client}>{children}</StoreProvider>;
  };

const noLive = ({ children }: { children: React.ReactNode }) => <StoreProvider>{children}</StoreProvider>;

describe("useStateData live updates", () => {
  it("subscribes the state's channel and exposes its counter as updatesAvailable$", async () => {
    const { client, counter, channel } = stubLive();
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });

    const { result } = renderHook(() => useStateData({ state: pageState, fetchFn, params: { page: 0 } }), {
      wrapper: withLive(client),
    });
    await firstValueFrom(result.current.data$); // fetch settled

    // window param `page` is dropped -> channel is the bare state key
    expect(channel).toHaveBeenCalledWith("page");

    const seen: number[] = [];
    const sub = result.current.updatesAvailable$.subscribe((v) => seen.push(v));
    counter.next(2);
    sub.unsubscribe();
    expect(seen).toEqual([0, 2]);
  });

  it("resets the counter when a fetch fulfills", async () => {
    const { client, reset } = stubLive();
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });

    const { result } = renderHook(() => useStateData({ state: pageState, fetchFn, params: { page: 0 } }), {
      wrapper: withLive(client),
    });
    await firstValueFrom(result.current.data$);

    expect(reset).toHaveBeenCalled();
  });

  it("applyUpdates resets the counter and refetches", async () => {
    const { client, reset } = stubLive();
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });

    const { result } = renderHook(() => useStateData({ state: pageState, fetchFn, params: { page: 0 } }), {
      wrapper: withLive(client),
    });
    await firstValueFrom(result.current.data$);

    const callsBefore = fetchFn.mock.calls.length;
    reset.mockClear();
    result.current.applyUpdates();
    await firstValueFrom(result.current.data$);

    expect(reset).toHaveBeenCalled();
    expect(fetchFn.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("lifts $grant from the fetch result and subscribes with the payload's entity topics", async () => {
    const { client, subscribed } = stubLive();
    const post1 = { id: "1", title: "One" };
    const fetchFn = async () => ({ posts: [post1], $grant: "h.payload.s" }) as never;

    const { result } = renderHook(() => useStateData({ state: pageState, fetchFn, params: { page: 0 } }), {
      wrapper: withLive(client),
    });
    const data = await firstValueFrom(result.current.data$);

    expect(subscribed).toEqual([{ grant: "h.payload.s", entities: ["post:1"] }]);
    // the $grant key must NOT reach the normalized data
    expect(data).toEqual({ posts: ["1"] });
    expect(data).not.toHaveProperty("$grant");
  });

  it("a payload without $grant subscribes nothing and normalizes as before", async () => {
    const { client, subscribe } = stubLive();
    const post1 = { id: "1", title: "One" };
    const fetchFn = async () => ({ posts: [post1] }) as never;

    const { result } = renderHook(() => useStateData({ state: pageState, fetchFn, params: { page: 0 } }), {
      wrapper: withLive(client),
    });
    const data = await firstValueFrom(result.current.data$);

    expect(subscribe).not.toHaveBeenCalled();
    expect(data).toEqual({ posts: ["1"] });
  });

  it("without a live client, updatesAvailable$ stays 0 and applyUpdates still reloads", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ posts: [] });

    const { result } = renderHook(() => useStateData({ state: pageState, fetchFn, params: { page: 0 } }), {
      wrapper: noLive,
    });
    await firstValueFrom(result.current.data$);

    expect(await firstValueFrom(result.current.updatesAvailable$)).toBe(0);

    const callsBefore = fetchFn.mock.calls.length;
    result.current.applyUpdates();
    await firstValueFrom(result.current.data$);
    expect(fetchFn.mock.calls.length).toBeGreaterThan(callsBefore);
  });
});
