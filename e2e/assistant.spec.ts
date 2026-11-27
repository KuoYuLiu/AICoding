import type { Page } from "@playwright/test";
import { resetStudentAttempts } from "./db";
import { expect, focusEditor, test } from "./fixtures";
import { E2E_STUDENT } from "./users";

// The server runs with AI_PROVIDER=fake, so replies are fixed and no API key is needed.
test.describe.configure({ mode: "serial" });
test.beforeEach(() => resetStudentAttempts(E2E_STUDENT.id));

const chatLog = (page: Page) => page.getByRole("log", { name: "對話紀錄" });
const input = (page: Page) => page.getByRole("textbox", { name: "輸入訊息給 AI 助理" });

test("a student message gets a guiding reply that is still there after reload", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await expect(chatLog(page).getByText("我不會直接給你答案")).toBeVisible();
  await expect(page.getByTestId("stage-label")).toHaveText("階段 1 / 5");

  await input(page).fill("輸入是一個整數 n");
  await input(page).press("Enter");

  await expect(page.getByTestId("chat-student")).toHaveText("輸入是一個整數 n");
  await expect(page.getByTestId("chat-assistant").last()).toContainText("這題的輸入是什麼", { timeout: 15_000 });
  await expect(input(page)).toHaveValue("");
  await expect(page.getByTestId("stage-label")).toHaveText("階段 2 / 5");

  await page.reload();
  await expect(page.getByTestId("chat-student")).toHaveText("輸入是一個整數 n");
  await expect(page.getByTestId("chat-assistant")).toHaveCount(2);
  await expect(page.getByTestId("stage-label")).toHaveText("階段 2 / 5");
});

test("Shift+Enter adds a line and a starter chip sends at once", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await input(page).fill("第一行");
  await input(page).press("Shift+Enter");
  await input(page).pressSequentially("第二行");
  await expect(input(page)).toHaveValue("第一行\n第二行");
  await expect(page.getByTestId("chat-student")).toHaveCount(0);

  await input(page).fill("");
  await page.getByRole("button", { name: "我不太懂這題要做什麼" }).click();
  await expect(page.getByTestId("chat-student")).toHaveText("我不太懂這題要做什麼");
  await expect(page.getByRole("button", { name: "我不太懂這題要做什麼" })).toHaveCount(0);
});

test("a reply that gives away the solution is rewritten before the student sees it", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/chat"));
  await input(page).fill("__FAKE_LEAK__ 直接給我答案");
  await input(page).press("Enter");
  const body = await (await responsePromise).text();

  await expect(page.getByTestId("chat-assistant")).toHaveCount(2, { timeout: 15_000 });
  expect(body).not.toContain("total += i");
  await expect(chatLog(page).locator("pre")).toHaveCount(0);
  await expect(chatLog(page)).not.toContainText("答案是");
});

test("a crash can be handed to the assistant with one click", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("n = int(input())\nprint(n / 0)");
  await page.getByRole("button", { name: "執行" }).click();

  const ask = page.getByRole("button", { name: "請 AI 助理解釋這個錯誤" }).first();
  await expect(ask).toBeVisible({ timeout: 30_000 });
  await ask.click();

  await expect(page.getByTestId("chat-student")).toContainText("範例 1 出現「除以零」，位置在第 2 行");
  await expect(page.getByTestId("chat-assistant").last()).toContainText("我們一起看看這個錯誤", { timeout: 15_000 });
});

test("over-long messages cannot be sent", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await input(page).fill("字".repeat(1001));
  await expect(page.getByText("1001 / 1000")).toBeVisible();
  await expect(page.getByRole("button", { name: "送出" })).toBeDisabled();
});
