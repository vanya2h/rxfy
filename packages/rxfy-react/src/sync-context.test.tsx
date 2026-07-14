import { renderHook } from "@testing-library/react";
import type { SyncClient } from "rxfy-client";
import { of } from "rxjs";
import { describe, expect, it } from "vitest";
import { StoreProvider } from "./StoreProvider.js";
import { useSyncClient } from "./sync-context.js";

const stubClient: SyncClient = {
  subscribe: () => {},
  channel: () => ({ available$: of(0), reset: () => {} }),
  stop: () => {},
};

describe("useSyncClient", () => {
  it("returns null when no syncClient prop is provided", () => {
    const { result } = renderHook(() => useSyncClient(), {
      wrapper: ({ children }) => <StoreProvider>{children}</StoreProvider>,
    });
    expect(result.current).toBeNull();
  });

  it("returns the provided syncClient", () => {
    const { result } = renderHook(() => useSyncClient(), {
      wrapper: ({ children }) => <StoreProvider syncClient={stubClient}>{children}</StoreProvider>,
    });
    expect(result.current).toBe(stubClient);
  });
});
