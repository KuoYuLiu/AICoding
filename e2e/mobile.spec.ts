import { expect, test } from "./fixtures";

test("narrow screens switch between problem, code and assistant tabs", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  const tabs = page.getByRole("tablist", { name: "解題區塊" });
  await expect(tabs).toBeVisible();
  await expect(page.locator(".monaco-editor")).toBeVisible();

  await tabs.getByRole("tab", { name: "題目" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "從 1 加到 n" })).toBeVisible();
  await expect(page.locator(".monaco-editor")).toBeHidden();

  await tabs.getByRole("tab", { name: "AI 助理" }).click();
  await expect(page.getByRole("heading", { name: "AI 助理" })).toBeVisible();
});
