"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditSample } from "@/lib/attempts/edit-history";

export type SaveStatus = "saved" | "pending" | "saving" | "error" | "closed";

const DEBOUNCE_MS = 1200;
const RETRY_MS = 5000;

/**
 * Saves code plus the edit history since the last save, debounced.
 * Edits are only dropped once the server has accepted them.
 */
export function useAutosave(attemptId: string, initialSavedAt: string) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const code = useRef<string | null>(null);
  const edits = useRef<EditSample[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const closed = useRef(false);
  const flushRef = useRef<(keepalive?: boolean) => Promise<void>>(async () => {});
  const url = `/api/attempts/${attemptId}/autosave`;

  const schedule = useCallback((delay: number, run: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(run, delay);
  }, []);

  const flush = useCallback(async (keepalive = false) => {
    if (closed.current || inFlight.current || code.current === null) return;
    inFlight.current = true;
    const sending = edits.current;
    const sentCode = code.current;
    edits.current = [];
    setStatus("saving");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: sentCode, edits: sending }),
        keepalive,
      });
      if (response.status === 409) {
        closed.current = true;
        setStatus("closed");
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { savedAt: string };
      setSavedAt(data.savedAt);
      if (code.current === sentCode && edits.current.length === 0) {
        code.current = null;
        setStatus("saved");
      } else {
        setStatus("pending");
        schedule(DEBOUNCE_MS, () => void flushRef.current());
      }
    } catch {
      edits.current = [...sending, ...edits.current];
      setStatus("error");
      schedule(RETRY_MS, () => void flushRef.current());
    } finally {
      inFlight.current = false;
    }
  }, [schedule, url]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const record = useCallback(
    (nextCode: string, newEdits: EditSample[]) => {
      if (closed.current) return;
      code.current = nextCode;
      edits.current.push(...newEdits);
      setStatus((current) => (current === "error" ? current : "pending"));
      schedule(DEBOUNCE_MS, () => void flushRef.current());
    },
    [schedule],
  );

  useEffect(() => {
    // Leaving the tab or page: save now instead of waiting for the debounce.
    const sendNow = () => {
      if (timer.current) clearTimeout(timer.current);
      void flushRef.current(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") sendNow();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendNow);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { status, savedAt, record };
}
