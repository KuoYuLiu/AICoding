import { resetStudentAttempts } from "./db";
import { expect, focusEditor, test } from "./fixtures";
import { E2E_STUDENT } from "./users";

test.beforeEach(() => resetStudentAttempts(E2E_STUDENT.id));

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

test("asking about an error on a phone opens the assistant tab", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("print(1 / 0)");
  await page.getByRole("button", { name: "執行" }).click();

  await page.getByRole("button", { name: "請 AI 助理解釋這個錯誤" }).first().click({ timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "AI 助理" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("chat-assistant").last()).toContainText("我們一起看看這個錯誤", { timeout: 15_000 });
});
