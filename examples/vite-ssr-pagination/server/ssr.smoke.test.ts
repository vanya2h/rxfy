import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { render } from "../src/entry-server.tsx";
import { api } from "./api.ts";

/**
 * Renders a page exactly the way server.ts does: `render()` with the in-process `api.request`,
 * piped on `onAllReady` so the HTML is fully resolved.
 */
function renderPage(url: string): Promise<{ html: string; state: string }> {
  return new Promise((resolve, reject) => {
    const { pipe, getState } = render(url, api.request, {
      onAllReady() {
        const sink = new PassThrough();
        let html = "";
        sink.on("data", (chunk: Buffer) => (html += chunk.toString()));
        sink.on("end", () => resolve({ html, state: getState() }));
        pipe(sink);
      },
      onError: (error) => reject(error instanceof Error ? error : new Error(String(error))),
    });
  });
}

describe("SSR smoke", () => {
  it("serves the first page fully resolved — content renders without JavaScript", async () => {
    const { html } = await renderPage("/");

    // The whole first page is in the markup, not behind a Suspense fallback.
    expect(html.match(/user-row/g)).toHaveLength(20);
    // Header line: entity + plain meta field (React may emit `<!-- -->` between text nodes).
    expect(html).toMatch(/1000(<!-- -->)? users/);

    // No hidden late chunks or inline reveal scripts — the fallback never reaches the client.
    // (Piping on onShellReady would emit `<div hidden id="S:n">` + $RC swaps instead; a browser
    // with JavaScript disabled would then be stuck on "Loading users…".)
    expect(html).not.toContain("Loading users…");
    expect(html).not.toContain("$RC");
    expect(html).not.toMatch(/<div hidden/);
  }, 15_000);

  it("dehydrates everything fetched during render into the state snapshot", async () => {
    const { state } = await renderPage("/");

    expect(state).toContain("__RXFY_SSR__");
    // Both queries land in the snapshot under their state keys…
    expect(state).toContain("users-header");
    expect(state).toContain("users:");
    // …and the user entities are serialized for the client store.
    expect(state).toContain("u20");
  }, 15_000);
});
