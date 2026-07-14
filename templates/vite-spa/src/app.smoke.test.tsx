import { renderToString } from "react-dom/server";
import { StoreProvider } from "rxfy-react";
import { describe, expect, it } from "vitest";
import { App } from "./App.tsx";

describe("App", () => {
  it("renders the shell with the query pending", () => {
    const html = renderToString(
      <StoreProvider>
        <App />
      </StoreProvider>,
    );
    expect(html).toContain("rxfy todos");
    // renderToString is synchronous — the stub fetch hasn't resolved, so the list is PENDING.
    expect(html).toContain("Loading…");
  });
});
