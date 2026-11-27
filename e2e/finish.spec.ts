import type { Page } from "@playwright/test";
import { resetStudentAttempts, withDb } from "./db";
import { expect, focusEditor, test } from "./fixtures";
import { E2E_STUDENT } from "./users";

// AI_PROVIDER=fake: the grader returns a fixed, valid result.
test.describe.configure({ mode: "serial" });
test.beforeEach(() => resetStudentAttempts(E2E_STUDENT.id));

async function replaceCode(page: Page, code: string) {
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(code);
}

async function latestGrade(): Promise<{ status: string; total: number | null } | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ status: string; total: number | null }>(
      `SELECT g.status, g.total FROM "Grade" g JOIN "Attempt" a ON a.id = g."attemptId" WHERE a."userId" = $1 ORDER BY g."createdAt" DESC LIMIT 1`,
      [E2E_STUDENT.id],
    );
    return rows[0] ?? null;
  });
}

test("passing every hidden test opens reflection, and finishing sends the work to AI grading", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await replaceCode(page, "n = int(input())\nprint(n * (n + 1) // 2)");
  await page.getByRole("button", { name: "提交測試" }).click();

  await expect(page.getByTestId("chat-assistant").last()).toContainText("第一個問題", { timeout: 30_000 });
  await expect(page.getByTestId("stage-label")).toHaveText("階段 5 / 5");
  await expect(page.getByTestId("reflection-banner")).toBeVisible();

  await page.getByTestId("reflection-banner").getByRole("button", { name: "結束作答" }).click();
  const dialog = page.getByRole("dialog", { name: "結束作答並送交評分？" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "結束並送交" }).click();

  await expect(page.getByTestId("closed-notice")).toContainText("已完成");
  await expect(page.getByRole("button", { name: "執行" })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "輸入訊息給 AI 助理" })).toHaveCount(0);

  await expect.poll(async () => (await latestGrade())?.status, { timeout: 15_000 }).toBe("AI_GRADED");
  // The student does not see an unpublished grade.
  await page.reload();
  await expect(page.getByTestId("closed-notice")).toBeVisible();
  await expect(page.getByTestId("grade-card")).toHaveCount(0);
});

test("finishing early warns first and ends as incomplete", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await page.getByRole("button", { name: "結束作答" }).click();
  const dialog = page.getByRole("dialog", { name: "測資還沒全部通過，確定要結束嗎？" });
  await expect(dialog).toContainText("學習反饋");

  await dialog.getByRole("button", { name: "繼續作答" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "執行" })).toBeEnabled();

  await page.getByRole("button", { name: "結束作答" }).click();
  await dialog.getByRole("button", { name: "仍要結束" }).click();
  await expect(page.getByTestId("closed-notice")).toContainText("未完成");

  // Incomplete: reflection is forced to 1 → 85 × 0.75 + 15 × 0.25 with the fake grader's level 3.
  await expect.poll(async () => (await latestGrade())?.total, { timeout: 15_000 }).toBe(67.5);
});
