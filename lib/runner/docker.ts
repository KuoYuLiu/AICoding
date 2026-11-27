import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { LanguageConfig } from "@/lib/languages";
import type { CodeRunner, RunRequest, RunResult } from "./types";

/**
 * Dev-only runner: executes student code in a throwaway, locked-down Docker container
 * on the developer's own machine. Production must use Judge0 (see createRunner).
 */

export const MAX_OUTPUT_BYTES = 64 * 1024;

/** Extra wall-clock seconds allowed for container start-up before we force-remove it. */
const STARTUP_GRACE_SEC = 30;

const SOURCE_ENV = "AICODING_SOURCE";

/** Writes the source into the tmpfs, drops it from the environment, then runs under `timeout`. */
const ENTRY_SCRIPT = `printf "%s" "$${SOURCE_ENV}" > "$1"; t="$2"; shift 2; unset ${SOURCE_ENV}; exec timeout -k 1 "$t" "$@"`;

export interface ExecOutcome {
  /** null when the process could not be started or was killed by our watchdog. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  watchdogFired: boolean;
  spawnError?: string;
}

export type ExecFn = (options: {
  args: string[];
  env: Record<string, string>;
  stdin: string;
  timeoutMs: number;
  containerName: string;
}) => Promise<ExecOutcome>;

export function buildDockerArgs(language: LanguageConfig, containerName: string): string[] {
  const { memoryMb, timeSec } = language.limits;
  return [
    "run",
    "--rm",
    "-i",
    "--name",
    containerName,
    "--network",
    "none",
    "--memory",
    `${memoryMb}m`,
    "--memory-swap",
    `${memoryMb}m`,
    "--cpus",
    "1",
    "--pids-limit",
    "64",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,size=16m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "65534:65534",
    "-w",
    "/tmp",
    "-e",
    SOURCE_ENV,
    language.docker.image,
    "sh",
    "-c",
    ENTRY_SCRIPT,
    "sh",
    language.fileName,
    String(timeSec),
    ...language.docker.command,
  ];
}

export function mapDockerOutcome(outcome: ExecOutcome): RunResult {
  const base = { stdout: outcome.stdout, timeSec: null, memoryKb: null };
  if (outcome.spawnError) {
    return { ...base, status: "internal_error", stderr: `無法啟動 Docker：${outcome.spawnError}` };
  }
  if (outcome.watchdogFired) {
    return { ...base, status: "time_limit", stderr: outcome.stderr };
  }
  switch (outcome.exitCode) {
    case 0:
      return { ...base, status: "ok", stderr: outcome.stderr };
    case 124:
      return { ...base, status: "time_limit", stderr: outcome.stderr };
    case 137:
      // SIGKILL without our timeout firing first: the kernel OOM killer.
      return { ...base, status: "memory_limit", stderr: outcome.stderr };
    case 125:
    case 126:
    case 127:
    case null:
      // Docker itself or the entry command failed, not the student's program.
      return { ...base, status: "internal_error", stderr: outcome.stderr };
    default:
      return { ...base, status: "runtime_error", stderr: outcome.stderr };
  }
}

function appendCapped(current: string, chunk: Buffer): string {
  if (current.length >= MAX_OUTPUT_BYTES) return current;
  const next = current + chunk.toString("utf8");
  return next.length > MAX_OUTPUT_BYTES ? `${next.slice(0, MAX_OUTPUT_BYTES)}\n…（輸出過長，已截斷）` : next;
}

export const spawnDocker: ExecFn = ({ args, env, stdin, timeoutMs, containerName }) =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let watchdogFired = false;
    let settled = false;
    const finish = (outcome: ExecOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    const child = spawn("docker", args, { env: { ...process.env, ...env }, windowsHide: true });
    const timer = setTimeout(() => {
      watchdogFired = true;
      spawn("docker", ["rm", "-f", containerName], { stdio: "ignore", windowsHide: true });
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => (stdout = appendCapped(stdout, chunk)));
    child.stderr.on("data", (chunk: Buffer) => (stderr = appendCapped(stderr, chunk)));
    child.on("error", (error) => finish({ exitCode: null, stdout, stderr, watchdogFired, spawnError: error.message }));
    child.on("close", (code) => finish({ exitCode: code, stdout, stderr, watchdogFired }));

    child.stdin.on("error", () => {
      // The program may exit without reading all of stdin; ignore EPIPE.
    });
    child.stdin.end(stdin);
  });

export class DockerRunner implements CodeRunner {
  constructor(private readonly exec: ExecFn = spawnDocker) {}

  async run({ language, sourceCode, stdin }: RunRequest): Promise<RunResult> {
    const containerName = `aicoding-run-${randomUUID()}`;
    const outcome = await this.exec({
      args: buildDockerArgs(language, containerName),
      env: { [SOURCE_ENV]: sourceCode },
      stdin,
      timeoutMs: (language.limits.timeSec + STARTUP_GRACE_SEC) * 1000,
      containerName,
    });
    return mapDockerOutcome(outcome);
  }
}
