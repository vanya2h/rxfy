import { renderHook } from "@testing-library/react";
import { of } from "rxjs";
import { describe, expect, it } from "vitest";
import type { LiveClient } from "./live/live-client.js";
import { useLiveClient } from "./live-context.js";
import { StoreProvider } from "./StoreProvider.js";

const stubClient: LiveClient = {
  channel: () => ({ available$: of(0), reset: () => {} }),
  stop: () => {},
};

describe("useLiveClient", () => {
  it("returns null when no liveClient prop is provided", () => {
    const { result } = renderHook(() => useLiveClient(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    });
    expect(result.current).toBeNull();
  });

  it("returns the provided liveClient", () => {
    const { result } = renderHook(() => useLiveClient(), {
      wrapper: ({ children }) => <StoreProvider liveClient={stubClient}>{children}</StoreProvider>,
    });
    expect(result.current).toBe(stubClient);
  });
});
