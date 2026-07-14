import type { Browser, BrowserContext, Page } from "@playwright/test";

export type Tab = {
  context: BrowserContext;
  page: Page;
  /** Count of sync `subscribe` frames this tab sent over its /live WebSocket. */
  subscribeFrames: () => number;
};

/**
 * Open `url` in a fresh browser context (a "tab"), counting the sync `subscribe` frames sent on its
 * WebSocket. A direct SSR load that sends zero subscribe frames is the fingerprint of the
 * grant-subscription regression this suite guards against.
 */
export async function openTab(browser: Browser, url: string): Promise<Tab> {
  const context = await browser.newContext();
  const page = await context.newPage();
  let subscribeFrames = 0;
  page.on("websocket", (ws) => {
    ws.on("framesent", (frame) => {
      const payload = typeof frame.payload === "string" ? frame.payload : "";
      if (payload.includes('"subscribe"')) subscribeFrames += 1;
    });
  });
  await page.goto(url, { waitUntil: "networkidle" });
  return { context, page, subscribeFrames: () => subscribeFrames };
}

/**
 * Discover the first post URL from a blog app's home page so the test can load the post detail
 * DIRECTLY (SSR) — never by clicking through, which would mask the regression.
 */
export async function scoutFirstPostUrl(browser: Browser, baseURL: string): Promise<string> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: "networkidle" });
    const href = await page.locator('a[href^="/posts/"]').first().getAttribute("href");
    if (!href) throw new Error(`no post link found on ${baseURL}`);
    return new URL(href, baseURL).toString();
  } finally {
    await context.close();
  }
}
