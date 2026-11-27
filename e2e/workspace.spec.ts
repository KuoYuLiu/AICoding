import { resetStudentAttempts, withDb } from "./db";
import type { Page } from "@playwright/test";
import { editorText, expect, focusEditor, test } from "./fixtures";
import { E2E_STUDENT } from "./users";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => resetStudentAttempts(E2E_STUDENT.id));

/** Resolves when the next successful autosave request completes. */
const waitForSave = (page: Page) =>
  page.waitForResponse((response) => response.url().endsWith("/autosave") && response.ok(), { timeout: 10_000 });

test("signed-out visitors see the sign-in page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "使用 Google 帳號登入" })).toBeVisible();
});

test("student opens the problem from the assignment list", async ({ signedIn: page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "我的作業" })).toBeVisible();
  await page.getByRole("link", { name: /從 1 加到 n/ }).click();

  await expect(page).toHaveURL(/\/problems\/sum-to-n$/);
  await expect(page.getByRole("heading", { level: 1, name: "從 1 加到 n" })).toBeVisible();
  await expect(page.getByText("範例 1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 助理" })).toBeVisible();
  await expect(page.locator(".monaco-editor")).toBeVisible();
});

test("pasting with the keyboard is blocked", async ({ signedIn: page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/problems/sum-to-n");
  await focusEditor(page);
  await page.keyboard.type("n = 1");
  await page.evaluate(() => navigator.clipboard.writeText("print(sum(range(int(input()) + 1)))"));

  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.getByTestId("blocked-toast")).toContainText("不能貼上");
  await page.keyboard.press("Shift+Insert");

  expect(await editorText(page)).toBe("n = 1");
});

test("paste and drop events never reach the editor", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");

  const outcome = await page.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>(".monaco-editor textarea");
    if (!textarea) throw new Error("no editor textarea");
    const data = new DataTransfer();
    data.setData("text/plain", "print('pasted')");
    const paste = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    const drop = new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true });
    textarea.dispatchEvent(paste);
    textarea.dispatchEvent(drop);
    return { pasteBlocked: paste.defaultPrevented, dropBlocked: drop.defaultPrevented };
  });

  expect(outcome).toEqual({ pasteBlocked: true, dropBlocked: true });
  await expect(page.getByTestId("blocked-toast")).toBeVisible();
  expect((await editorText(page)).trim()).toBe("");
});

test("the right-click menu offers no paste", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await page.locator(".monaco-editor .view-lines").click({ button: "right" });
  await expect(page.locator(".monaco-menu")).toHaveCount(0);
});

test("code is saved automatically and survives a reload", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  const saved = waitForSave(page);
  await page.keyboard.type("n = int(input())");
  await saved;
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved");

  await page.reload();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect.poll(() => editorText(page)).toBe("n = int(input())");
});

test("typing is recorded as small edits, and a large insertion is flagged", async ({ signedIn: page }) => {
  await page.goto("/problems/sum-to-n");
  await focusEditor(page);
  await page.keyboard.press("End");
  const saved = waitForSave(page);
  await page.keyboard.type("\nprint(n)");
  await saved;

  const attemptId = await withDb(async (db) => {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM "Attempt" WHERE "userId" = $1`, [E2E_STUDENT.id]);
    return rows[0].id;
  });

  // Text that appears in one go (for example from a browser extension) arrives as one large edit.
  const response = await page.request.post(`/api/attempts/${attemptId}/autosave`, {
    data: {
      code: "n = int(input())\nprint(sum(range(n + 1)))",
      edits: [{ at: Date.now(), inserted: 120, deleted: 0, kind: "edit" }],
    },
  });
  expect(response.ok()).toBe(true);

  const events = await withDb(async (db) => {
    const { rows } = await db.query<{ insertedChars: number; flagged: boolean }>(
      `SELECT "insertedChars", flagged FROM "EditEvent" WHERE "attemptId" = $1`,
      [attemptId],
    );
    return rows;
  });
  expect(events.length).toBeGreaterThan(10);
  expect(events.filter((event) => event.flagged).map((event) => event.insertedChars)).toEqual([120]);
});

test("another student's attempt cannot be written", async ({ signedIn: page }) => {
  const response = await page.request.post("/api/attempts/not-mine/autosave", { data: { code: "x", edits: [] } });
  expect(response.status()).toBe(404);
});
