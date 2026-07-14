import { expect, test } from "@playwright/test";
import { blog } from "../fixtures/selectors";
import { openTab, scoutFirstPostUrl } from "../fixtures/two-tab";

test("comment posted in one tab shows a live badge in another, then applies", async ({ browser, baseURL }) => {
  // Load the post detail DIRECTLY (SSR) in both tabs — navigating there would mask the regression.
  const postUrl = await scoutFirstPostUrl(browser, baseURL!);
  const a = await openTab(browser, postUrl);
  const b = await openTab(browser, postUrl);
  try {
    expect(a.subscribeFrames(), "tab A subscribed on direct load").toBeGreaterThan(0);
    expect(b.subscribeFrames(), "tab B subscribed on direct load").toBeGreaterThan(0);

    const body = `e2e-comment-${Date.now()}`;
    await b.page.fill(blog.nameInput, "E2E");
    await b.page.fill(blog.commentInput, body);
    await b.page.click(blog.submit);

    // A shows the live updates badge (channel stale), then applying reveals B's comment.
    const badge = a.page.getByRole("button", { name: blog.badgeName });
    await expect(badge).toBeVisible();
    await badge.click();
    await expect(a.page.getByText(body)).toBeVisible();
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
