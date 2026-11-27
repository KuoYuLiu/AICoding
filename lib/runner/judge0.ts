import type { CodeRunner, RunRequest, RunResult, RunStatus } from "./types";

interface Judge0Response {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
  memory: number | null;
  status: { id: number; description: string };
}

/** Maps Judge0 status ids (https://ce.judge0.com/statuses) to our statuses. */
export function mapJudge0Status(statusId: number): RunStatus {
  if (statusId === 3 || statusId === 4) return "ok"; // Accepted, Wrong Answer: we compare outputs ourselves
  if (statusId === 5) return "time_limit";
  if (statusId === 6) return "compile_error";
  if (statusId >= 7 && statusId <= 12) return "runtime_error";
  return "internal_error";
}

/** Self-hosted Judge0 takes X-Auth-Token; the RapidAPI-hosted Judge0 CE wants its own key and host headers. */
export function judge0Headers(baseUrl: string, apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!apiKey) return headers;
  const host = new URL(baseUrl).host;
  if (host.endsWith("rapidapi.com")) {
    headers["X-RapidAPI-Key"] = apiKey;
    headers["X-RapidAPI-Host"] = host;
  } else {
    headers["X-Auth-Token"] = apiKey;
  }
  return headers;
}

export class Judge0Runner implements CodeRunner {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async run({ language, sourceCode, stdin }: RunRequest): Promise<RunResult> {
    const headers = judge0Headers(this.baseUrl, this.apiKey);

    const response = await fetch(`${this.baseUrl}/submissions?base64_encoded=false&wait=true`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        language_id: language.judge0LanguageId,
        source_code: sourceCode,
        stdin,
        cpu_time_limit: language.limits.timeSec,
        memory_limit: language.limits.memoryMb * 1024,
      }),
    });

    if (!response.ok) {
      return { status: "internal_error", stdout: "", stderr: `Judge0 HTTP ${response.status}`, timeSec: null, memoryKb: null };
    }

    const data = (await response.json()) as Judge0Response;
    let status = mapJudge0Status(data.status.id);
    const memoryKb = data.memory;
    if (status === "runtime_error" && memoryKb !== null && memoryKb >= language.limits.memoryMb * 1024) {
      status = "memory_limit";
    }
    return {
      status,
      stdout: data.stdout ?? "",
      stderr: data.compile_output ?? data.stderr ?? "",
      timeSec: data.time === null ? null : Number(data.time),
      memoryKb,
    };
  }
}
