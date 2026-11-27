import { test as base, expect, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { E2E_STUDENT, E2E_TEACHER } from "./users";

const COOKIE = "authjs.session-token";

type E2EUser = { id: string; email: string; name: string };

/** Signs the browser in by minting the same JWT cookie Auth.js would set after Google sign-in. */
async function signIn(page: Page, baseURL: string, user: E2EUser = E2E_STUDENT, role: "STUDENT" | "TEACHER" = "STUDENT") {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for e2e tests");
  const value = await encode({
    salt: COOKIE,
    secret,
    token: { sub: user.id, email: user.email, name: user.name, userId: user.id, role },
  });
  await page.context().addCookies([{ name: COOKIE, value, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}

export const test = base.extend<{ signedIn: Page; teacher: Page }>({
  signedIn: async ({ page, baseURL }, provide) => {
    await signIn(page, baseURL ?? "http://localhost:3100");
    await provide(page);
  },
  /** A second browser context signed in as the e2e teacher. */
  teacher: async ({ browser, baseURL }, provide) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, baseURL ?? "http://localhost:3100", E2E_TEACHER, "TEACHER");
    await provide(page);
    await context.close();
  },
});

export { expect };

/** Text currently in the Monaco editor (Monaco renders spaces as non-breaking spaces). */
export async function editorText(page: Page): Promise<string> {
  const text = await page.locator(".monaco-editor .view-lines").innerText();
  return text.replace(/ /g, " ");
}

export async function focusEditor(page: Page) {
  await page.locator(".monaco-editor .view-lines").click();
}
