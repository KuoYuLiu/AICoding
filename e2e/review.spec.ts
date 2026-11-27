import type { Page } from "@playwright/test";
import { resetStudentAttempts, withDb } from "./db";
import { expect, focusEditor, test } from "./fixtures";
import { E2E_STUDENT } from "./users";

// AI_PROVIDER=fake: the grader gives level 3 everywhere (75 points).
test.describe.configure({ mode: "serial" });
test.beforeEach(() => resetStudentAttempts(E2E_STUDENT.id));

async function gradeStatuses(): Promise<string[]> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ status: string }>(
      `SELECT g.status FROM "Grade" g JOIN "Attempt" a ON a.id = g."attemptId" WHERE a."userId" = $1 ORDER BY g.version`,
      [E2E_STUDENT.id],
    );
    return rows.map((row) => row.status);
  });
}

/** The student solves the problem, finishes, and waits for the AI grade. */
async function solveAndFinish(page: Page) {
  await page.goto("/problems/sum-to-n");
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("n = int(input())\nprint(n * (n + 1) // 2)");
  await page.getByRole("textbox", { name: "輸入訊息給 AI 助理" }).fill("我用公式 n(n+1)/2");
  await page.getByRole("textbox", { name: "輸入訊息給 AI 助理" }).press("Enter");
  await expect(page.getByTestId("chat-assistant")).toHaveCount(2, { timeout: 15_000 });
  await page.getByRole("button", { name: "提交測試" }).click();
  await page.getByTestId("reflection-banner").getByRole("button", { name: "結束作答" }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "結束並送交" }).click();
  await expect(page.getByTestId("closed-notice")).toBeVisible();
  await expect.poll(gradeStatuses, { timeout: 15_000 }).toEqual(["AI_GRADED"]);
}

async function openReview(teacher: Page) {
  await teacher.goto("/teacher");
  const row = teacher.getByTestId("queue-row").filter({ hasText: "測試學生" });
  await expect(row.getByTestId("grade-status")).toHaveText("AI 已評");
  await row.getByRole("link", { name: "審核" }).click();
  await expect(teacher.getByRole("heading", { level: 1 })).toContainText("測試學生 · 從 1 加到 n");
}

test("a teacher edits, confirms and publishes, and only then the student sees the grade", async ({ signedIn: student, teacher }) => {
  await solveAndFinish(student);
  await openReview(teacher);

  await expect(teacher.getByText("我用公式 n(n+1)/2", { exact: true })).toBeVisible();
  await expect(teacher.getByRole("cell", { name: "4999950000" }).first()).toBeVisible(); // Hidden test content is shown to the teacher only.
  await expect(teacher.getByTestId("grade-total")).toContainText("75");

  await teacher.getByRole("radiogroup", { name: "題目理解等級" }).getByText("4 優秀").click();
  await expect(teacher.getByTestId("grade-total")).toContainText("80");
  await teacher.getByRole("button", { name: "儲存修改" }).click();
  await expect(teacher.getByText("修改評分 · e2e-teacher@example.test")).toBeVisible();

  await teacher.getByRole("button", { name: "確認評分" }).click();
  await expect(teacher.getByTestId("grade-status").first()).toHaveText("教師已確認");

  // Confirmed is still not visible to the student.
  await student.reload();
  await expect(student.getByTestId("grade-card")).toHaveCount(0);

  await teacher.getByRole("button", { name: "公佈成績給學生" }).click();
  await expect(teacher.getByTestId("grade-status").first()).toHaveText("已公佈");
  await expect(teacher.getByRole("button", { name: "請 AI 重改" })).toHaveCount(0);

  await student.reload();
  await expect(student.getByTestId("grade-card")).toContainText("80");
  await expect(student.getByTestId("grade-card")).toContainText("題目理解");
  await student.goto("/");
  await expect(student.getByTestId("published-total")).toHaveText("成績 80 分");
});

test("asking the AI to regrade creates a new version and keeps the old one", async ({ signedIn: student, teacher }) => {
  await solveAndFinish(student);
  await openReview(teacher);

  await teacher.getByRole("button", { name: "請 AI 重改" }).click();
  await teacher.getByRole("textbox", { name: /重改意見/ }).fill("學生主動用公式，組合解題邏輯請再評估。");
  await teacher.getByRole("button", { name: "送出重改" }).click();

  await expect(teacher.getByTestId("grade-version")).toHaveCount(2);
  await expect(teacher.getByText("第 2 版").first()).toBeVisible();
  await expect(teacher.getByText("請 AI 重改 · e2e-teacher@example.test")).toBeVisible();
  expect(await gradeStatuses()).toEqual(["AI_GRADED", "AI_GRADED"]);
});

test("students cannot reach the review pages or actions", async ({ signedIn: student }) => {
  await student.goto("/teacher");
  await expect(student).toHaveURL(/\/$/);
  const response = await student.request.post("/api/teacher/grades/anything", { data: { action: "publish" } });
  expect(response.status()).toBe(403);
});
