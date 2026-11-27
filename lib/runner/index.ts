import { Judge0Runner } from "./judge0";
import type { CodeRunner } from "./types";

export type { LanguageConfig } from "@/lib/languages";
export * from "./types";
export { outputsMatch, runTestCases } from "./judge";

export function createRunner(): CodeRunner {
  const baseUrl = process.env.JUDGE0_URL;
  if (!baseUrl) {
    throw new Error("JUDGE0_URL is not set");
  }
  return new Judge0Runner(baseUrl, process.env.JUDGE0_API_KEY);
}
