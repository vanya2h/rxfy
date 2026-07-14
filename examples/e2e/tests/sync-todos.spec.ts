import { expect, test } from "@playwright/test";
import { todos } from "../fixtures/selectors";
import { openTab } from "../fixtures/two-tab";

test.describe("sync-todos", () => {
  test("create in one tab shows a live badge in another, then applies", async ({ browser, baseURL }) => {
    const a = await openTab(browser, baseURL!);
    const b = await openTab(browser, baseURL!);
    try {
      // Both SSR-loaded tabs must have subscribed on load; zero is the regression fingerprint.
      expect(a.subscribeFrames(), "tab A subscribed on direct load").toBeGreaterThan(0);
      expect(b.subscribeFrames(), "tab B subscribed on direct load").toBeGreaterThan(0);

      const title = `e2e-todo-${Date.now()}`;
      await b.page.fill(todos.addInput, title);
      await b.page.click(todos.addButton);

      const badge = a.page.locator(todos.badge);
      await expect(badge).toBeVisible();
      await badge.click();
      await expect(a.page.getByText(title)).toBeVisible();
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });

  test("toggle propagates live to BOTH tabs, including the one that clicked", async ({ browser, baseURL }) => {
    const a = await openTab(browser, baseURL!);
    const b = await openTab(browser, baseURL!);
    try {
      const boxA = a.page.locator(todos.checkbox).first();
      const boxB = b.page.locator(todos.checkbox).first();
      const before = await boxB.isChecked();

      // Toggle in B. There is no optimistic update — B relies on the echo patch, same as A.
      await boxB.click();

      // The clicking tab (B) AND the other tab (A) must both reflect the new state.
      await expect(boxB, "clicking tab reflects its own toggle").toBeChecked({ checked: !before });
      await expect(boxA, "other tab reflects the toggle").toBeChecked({ checked: !before });
    } finally {
      await a.context.close();
      await b.context.close();
    }
  });
});
