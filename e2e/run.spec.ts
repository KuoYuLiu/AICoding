import type { Page } from "@playwright/test";
import { resetStudentAttempts } from "./db";
import { expect, focusEditor, test } from "./fixtures";
import { E2E_STUDENT } from "./users";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => resetStudentAttempts(E2E_STUDENT.id));

async function replaceCode(page: Page, code: string) {
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(code);
}

const runPanel = (page: Page) => page.getByRole("tabpanel", { name: "執行結果" });

test("running a correct program shows every sample passing", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await replaceCode(page, "n = int(input())\nprint(n * (n + 1) // 2)");
  await page.getByRole("button", { name: "執行" }).click();

  await expect(page.getByTestId("result-summary")).toContainText("範例測資 2 / 2 通過", { timeout: 30_000 });
  await expect(runPanel(page).getByText("全部通過")).toBeVisible();
});

test("a wrong answer shows expected and actual output side by side", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await replaceCode(page, "n = int(input())\nprint(n)");
  await page.keyboard.press("ControlOrMeta+Enter");

  await expect(page.getByTestId("result-summary")).toContainText("範例測資 0 / 2 通過", { timeout: 30_000 });
  await expect(runPanel(page).getByText("答案錯誤").first()).toBeVisible();
  await expect(page.getByTestId("actual-output").first()).toHaveText("5");
});

test("a crash is explained in plain Chinese with its line number", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await replaceCode(page, "n = int(input())\nprint(n / 0)");
  await page.getByRole("button", { name: "執行" }).click();

  await expect(runPanel(page).getByText("除以零").first()).toBeVisible({ timeout: 30_000 });
  await expect(runPanel(page).getByText("（第 2 行）").first()).toBeVisible();
  await runPanel(page).getByText("原始錯誤訊息").first().click();
  await expect(runPanel(page).getByText(/ZeroDivisionError/).first()).toBeVisible();
});

test("submitting runs the hidden tests and reveals only verdicts", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await replaceCode(page, "n = int(input())\nprint(n * (n + 1) // 2)");

  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/submit"));
  await page.getByRole("button", { name: "提交測試" }).click();
  const body = await (await responsePromise).text();

  await expect(page.getByTestId("result-summary")).toContainText("隱藏測資 6 / 6 通過", { timeout: 30_000 });
  // The hidden inputs (e.g. 99999) and outputs (e.g. 4999950000) never reach the browser.
  expect(body).not.toMatch(/99999|4999950000|5000050000|secret/);

  await page.reload();
  await expect(page.getByRole("tab", { name: /測試結果/ })).toContainText("6/6");
});
