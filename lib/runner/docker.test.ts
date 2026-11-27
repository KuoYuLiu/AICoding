import { describe, expect, it } from "vitest";
import { getLanguage } from "@/lib/languages";
import { DockerRunner, buildDockerArgs, mapDockerOutcome, type ExecFn, type ExecOutcome } from "./docker";
import { createRunner } from "./index";

const python = getLanguage("python-3");

function outcome(partial: Partial<ExecOutcome>): ExecOutcome {
  return { exitCode: 0, stdout: "", stderr: "", watchdogFired: false, ...partial };
}

describe("buildDockerArgs", () => {
  const args = buildDockerArgs(python, "c1");

  it("locks the container down", () => {
    expect(args.join(" ")).toContain("--network none");
    expect(args.join(" ")).toContain("--memory 128m --memory-swap 128m");
    expect(args).toContain("--read-only");
    expect(args).toContain("--rm");
    expect(args.join(" ")).toContain("--cap-drop ALL");
    expect(args.join(" ")).toContain("--user 65534:65534");
  });

  it("passes the source through the environment, never as an argument", () => {
    expect(args.join(" ")).toContain("-e AICODING_SOURCE");
    expect(args.some((arg) => arg.startsWith("AICODING_SOURCE="))).toBe(false);
  });

  it("ends with image, file name, time limit and the language command", () => {
    expect(args.slice(-5)).toEqual(["sh", "main.py", "5", "python3", "main.py"]);
    expect(args).toContain("python:3.12-slim");
  });
});

describe("mapDockerOutcome", () => {
  it("maps exit codes to statuses", () => {
    expect(mapDockerOutcome(outcome({ exitCode: 0, stdout: "55\n" }))).toMatchObject({ status: "ok", stdout: "55\n" });
    expect(mapDockerOutcome(outcome({ exitCode: 1 })).status).toBe("runtime_error");
    expect(mapDockerOutcome(outcome({ exitCode: 124 })).status).toBe("time_limit");
    expect(mapDockerOutcome(outcome({ exitCode: 137 })).status).toBe("memory_limit");
    expect(mapDockerOutcome(outcome({ exitCode: 125 })).status).toBe("internal_error");
    expect(mapDockerOutcome(outcome({ exitCode: null, watchdogFired: true })).status).toBe("time_limit");
  });

  it("reports a missing Docker as an internal error", () => {
    const result = mapDockerOutcome(outcome({ exitCode: null, spawnError: "spawn docker ENOENT" }));
    expect(result.status).toBe("internal_error");
    expect(result.stderr).toContain("Docker");
  });
});

describe("DockerRunner", () => {
  it("hands source, stdin and a watchdog to the exec function", async () => {
    let seen: Parameters<ExecFn>[0] | undefined;
    const exec: ExecFn = async (options) => {
      seen = options;
      return outcome({ stdout: "ok\n" });
    };
    const result = await new DockerRunner(exec).run({ language: python, sourceCode: "print('ok')", stdin: "3\n" });

    expect(result.status).toBe("ok");
    expect(seen?.env).toEqual({ AICODING_SOURCE: "print('ok')" });
    expect(seen?.stdin).toBe("3\n");
    expect(seen?.timeoutMs).toBeGreaterThan(python.limits.timeSec * 1000);
    expect(seen?.args).toContain(seen?.containerName);
  });
});

describe("createRunner", () => {
  it("defaults to Judge0 and needs JUDGE0_URL", () => {
    expect(() => createRunner({ NODE_ENV: "development" })).toThrow("JUDGE0_URL");
    expect(createRunner({ NODE_ENV: "development", JUDGE0_URL: "http://localhost:2358" }).constructor.name).toBe("Judge0Runner");
  });

  it("allows the Docker runner only outside production", () => {
    expect(createRunner({ NODE_ENV: "development", CODE_RUNNER: "docker" })).toBeInstanceOf(DockerRunner);
    expect(() => createRunner({ NODE_ENV: "production", CODE_RUNNER: "docker" })).toThrow("development only");
    expect(
      createRunner({ NODE_ENV: "production", CODE_RUNNER: "docker", CODE_RUNNER_ALLOW_DOCKER_IN_PRODUCTION: "true" }),
    ).toBeInstanceOf(DockerRunner);
    expect(() => createRunner({ NODE_ENV: "development", CODE_RUNNER: "other" })).toThrow("Unknown CODE_RUNNER");
  });
});

// Real containers: run with DOCKER_TESTS=1 npm test (needs Docker and the python:3.12-slim image).
describe.runIf(process.env.DOCKER_TESTS === "1")("DockerRunner with real Docker", () => {
  const runner = new DockerRunner();
  const run = (sourceCode: string, stdin = "") => runner.run({ language: python, sourceCode, stdin });

  it("runs a program with stdin", async () => {
    const result = await run("n = int(input())\nprint(sum(range(n + 1)))", "10\n");
    expect(result).toMatchObject({ status: "ok", stdout: "55\n" });
  });

  it("reports runtime errors with the traceback", async () => {
    const result = await run("print(1 / 0)");
    expect(result.status).toBe("runtime_error");
    expect(result.stderr).toContain("ZeroDivisionError");
    expect(result.stderr).toContain("main.py");
  });

  it("stops infinite loops", async () => {
    expect((await run("while True:\n    pass")).status).toBe("time_limit");
  }, 20_000);

  it("stops runaway memory", async () => {
    expect((await run("x = bytearray(512 * 1024 * 1024)")).status).toBe("memory_limit");
  });

  it("has no network and cannot see its own source variable", async () => {
    const result = await run(
      "import os, socket\nprint(os.environ.get('AICODING_SOURCE'))\ntry:\n    socket.create_connection(('1.1.1.1', 53), timeout=2)\n    print('online')\nexcept OSError:\n    print('offline')",
    );
    expect(result).toMatchObject({ status: "ok", stdout: "None\noffline\n" });
  });
});
