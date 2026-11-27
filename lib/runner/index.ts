import { DockerRunner } from "./docker";
import { Judge0Runner } from "./judge0";
import type { CodeRunner } from "./types";

export type { LanguageConfig } from "@/lib/languages";
export * from "./types";
export { outputsMatch, runTestCases } from "./judge";

/**
 * CODE_RUNNER=judge0 (default) sends code to Judge0.
 * CODE_RUNNER=docker runs it in a local container and is for development only.
 */
export function createRunner(env: NodeJS.ProcessEnv = process.env): CodeRunner {
  const kind = env.CODE_RUNNER ?? "judge0";

  if (kind === "docker") {
    if (env.NODE_ENV === "production") {
      throw new Error("CODE_RUNNER=docker is for local development only; use Judge0 in production");
    }
    return new DockerRunner();
  }

  if (kind !== "judge0") {
    throw new Error(`Unknown CODE_RUNNER: ${kind}`);
  }
  const baseUrl = env.JUDGE0_URL;
  if (!baseUrl) {
    throw new Error("JUDGE0_URL is not set");
  }
  return new Judge0Runner(baseUrl, env.JUDGE0_API_KEY);
}
