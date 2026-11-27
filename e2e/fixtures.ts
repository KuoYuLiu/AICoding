import { test as base, expect, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { E2E_STUDENT } from "./users";

const COOKIE = "authjs.session-token";

/** Signs the browser in as the e2e student by minting the same JWT cookie Auth.js would set after Google sign-in. */
async function signIn(page: Page, baseURL: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for e2e tests");
  const value = await encode({
    salt: COOKIE,
    secret,
    token: { sub: E2E_STUDENT.id, email: E2E_STUDENT.email, name: E2E_STUDENT.name, userId: E2E_STUDENT.id, role: "STUDENT" },
  });
  await page.context().addCookies([{ name: COOKIE, value, url: baseURL, httpOnly: true, sameSite: "Lax" }]);
}

export const test = base.extend<{ signedIn: Page }>({
  signedIn: async ({ page, baseURL }, provide) => {
    await signIn(page, baseURL ?? "http://localhost:3100");
    await provide(page);
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
