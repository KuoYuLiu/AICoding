"use client";

import { useCallback, useRef, useState } from "react";
import type { RunKind, RunView } from "@/lib/attempts/run";

export interface RunnerState {
  run: RunView | null;
  submit: RunView | null;
  running: RunKind | null;
  error: { kind: RunKind; message: string } | null;
}

export function useRunner(attemptId: string, initial: { run: RunView | null; submit: RunView | null }) {
  const [state, setState] = useState<RunnerState>({ ...initial, running: null, error: null });
  const busy = useRef(false);

  const execute = useCallback(
    async (kind: RunKind, code: string) => {
      // Ignore clicks while a run is in progress.
      if (busy.current) return;
      busy.current = true;
      setState((current) => ({ ...current, running: kind, error: null }));

      try {
        const response = await fetch(`/api/attempts/${attemptId}/${kind}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = (await response.json().catch(() => ({}))) as RunView | { error?: string };
        if (!response.ok || !("kind" in data)) {
          const message = "error" in data && data.error ? data.error : "執行失敗，請稍後再試。";
          setState((current) => ({ ...current, running: null, error: { kind, message } }));
          return;
        }
        setState((current) => ({ ...current, [kind]: data, running: null, error: null }));
      } catch {
        setState((current) => ({ ...current, running: null, error: { kind, message: "連線中斷，請檢查網路後再試一次。" } }));
      } finally {
        busy.current = false;
      }
    },
    [attemptId],
  );

  return { state, execute };
}
