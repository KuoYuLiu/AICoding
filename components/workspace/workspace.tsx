"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { AttemptView } from "@/lib/attempts/repository";
import type { RunKind, RunView } from "@/lib/attempts/run";
import type { EditSample } from "@/lib/attempts/edit-history";
import type { PublicProblem } from "@/lib/problems/public";
import { AssistantPane } from "./assistant-pane";
import { CodeEditor, type BlockedInput } from "./code-editor";
import { OutputPane } from "./output-pane";
import { ProblemPane } from "./problem-pane";
import { useAutosave, type SaveStatus } from "./use-autosave";
import { useRunner } from "./use-runner";

export interface WorkspaceLanguage {
  name: string;
  editorMode: string;
  fileName: string;
  limits: { timeSec: number; memoryMb: number };
}

interface WorkspaceProps {
  problem: PublicProblem;
  attempt: AttemptView;
  language: WorkspaceLanguage;
  initialResults: { run: RunView | null; submit: RunView | null };
}

function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => null,
  );
}

const MOBILE_TABS = [
  { id: "problem", label: "題目" },
  { id: "code", label: "程式" },
  { id: "assistant", label: "AI 助理" },
] as const;
type MobileTab = (typeof MOBILE_TABS)[number]["id"];

export function Workspace({ problem, attempt, language, initialResults }: WorkspaceProps) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const dark = useMediaQuery("(prefers-color-scheme: dark)") ?? false;
  const [mobileTab, setMobileTab] = useState<MobileTab>("code");
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const latestCode = useRef(attempt.code);
  const { status, savedAt, record } = useAutosave(attempt.id, attempt.updatedAt);
  const readOnly = attempt.status !== "IN_PROGRESS" || status === "closed";
  const { state: runner, execute } = useRunner(attempt.id, initialResults);
  const [outputTab, setOutputTab] = useState<RunKind>(initialResults.submit && !initialResults.run ? "submit" : "run");

  const startRun = useCallback(
    (kind: RunKind) => {
      setOutputTab(kind);
      setMobileTab("code");
      void execute(kind, latestCode.current);
    },
    [execute],
  );
  const runSamples = useCallback(() => startRun("run"), [startRun]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  const handleChange = useCallback(
    (code: string, edits: EditSample[]) => {
      latestCode.current = code;
      record(code, edits);
    },
    [record],
  );

  const getLatestCode = useCallback(() => latestCode.current, []);

  const handleBlocked = useCallback((kind: BlockedInput) => {
    setToast({
      id: Date.now(),
      text: kind === "paste" ? "這裡不能貼上程式碼，請自己動手輸入。" : "這裡不能拖放文字，請自己動手輸入。",
    });
  }, []);

  if (isDesktop === null) {
    return <div className="flex-1" aria-busy="true" />;
  }

  const problemPane = <ProblemPane problem={problem} languageName={language.name} limits={language.limits} />;
  const editorPane = (
    <EditorPane
      fileName={language.fileName}
      status={status}
      savedAt={savedAt}
      running={runner.running}
      disabled={readOnly}
      onRun={runSamples}
      onSubmit={() => startRun("submit")}
    >
      <CodeEditor
        initialValue={getLatestCode}
        language={language.editorMode}
        dark={dark}
        readOnly={readOnly}
        onChange={handleChange}
        onBlockedInput={handleBlocked}
        onRunShortcut={runSamples}
      />
    </EditorPane>
  );
  const assistantPane = <AssistantPane stage={attempt.stage} />;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          data-testid="blocked-toast"
          className="animate-toast-in pointer-events-none absolute inset-x-0 bottom-6 z-20 mx-auto w-fit max-w-[90%] rounded-lg bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {toast.text}
        </div>
      )}

      {isDesktop ? (
        <Group orientation="horizontal" className="flex-1 p-2">
          <Panel defaultSize="28%" minSize={260}>
            <Card>{problemPane}</Card>
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel defaultSize="44%" minSize={360}>
            <Group orientation="vertical">
              <Panel defaultSize="68%" minSize={160}>
                <Card>{editorPane}</Card>
              </Panel>
              <ResizeHandle orientation="horizontal" />
              <Panel defaultSize="32%" minSize={96}>
                <Card>
                  <OutputPane state={runner} tab={outputTab} onTabChange={setOutputTab} />
                </Card>
              </Panel>
            </Group>
          </Panel>
          <ResizeHandle orientation="vertical" />
          <Panel defaultSize="28%" minSize={280}>
            <Card>{assistantPane}</Card>
          </Panel>
        </Group>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div role="tablist" aria-label="解題區塊" className="flex border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            {MOBILE_TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={mobileTab === tab.id}
                aria-controls={`mobile-panel-${tab.id}`}
                onClick={() => setMobileTab(tab.id)}
                className={`flex-1 border-b-2 py-2.5 text-sm font-medium transition-colors ${
                  mobileTab === tab.id ? "border-indigo-500 text-zinc-900 dark:text-zinc-100" : "border-transparent text-zinc-500"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {/* Panels stay mounted so the editor keeps its state when switching tabs. */}
          <div id="mobile-panel-problem" role="tabpanel" hidden={mobileTab !== "problem"} className="min-h-0 flex-1 bg-white dark:bg-zinc-950">
            {problemPane}
          </div>
          <div id="mobile-panel-code" role="tabpanel" hidden={mobileTab !== "code"} className="flex min-h-0 flex-1 flex-col gap-2 p-2">
            <Card className="min-h-0 flex-[2]">{editorPane}</Card>
            <Card className="min-h-0 flex-1">
              <OutputPane state={runner} tab={outputTab} onTabChange={setOutputTab} />
            </Card>
          </div>
          <div id="mobile-panel-assistant" role="tabpanel" hidden={mobileTab !== "assistant"} className="min-h-0 flex-1 bg-white dark:bg-zinc-950">
            {assistantPane}
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ children, className = "h-full" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950 ${className}`}>
      {children}
    </section>
  );
}

function ResizeHandle({ orientation }: { orientation: "vertical" | "horizontal" }) {
  return (
    <Separator
      className={`group relative flex items-center justify-center outline-none ${orientation === "vertical" ? "w-2" : "h-2"}`}
    >
      <span
        className={`rounded-full bg-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[separator=active]:opacity-100 dark:bg-zinc-700 ${
          orientation === "vertical" ? "h-8 w-1" : "h-1 w-8"
        }`}
      />
    </Separator>
  );
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "已儲存",
  pending: "尚未儲存",
  saving: "儲存中…",
  error: "儲存失敗，稍後自動重試",
  closed: "作答已結束，無法修改",
};

interface EditorPaneProps {
  fileName: string;
  status: SaveStatus;
  savedAt: string;
  running: RunKind | null;
  disabled: boolean;
  onRun: () => void;
  onSubmit: () => void;
  children: ReactNode;
}

function EditorPane({ fileName, status, savedAt, running, disabled, onRun, onSubmit, children }: EditorPaneProps) {
  const time = new Date(savedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{fileName}</span>
          <span
            data-testid="save-status"
            data-status={status}
            aria-live="polite"
            className={`flex items-center gap-1.5 truncate text-xs ${status === "error" || status === "closed" ? "text-rose-600 dark:text-rose-400" : "text-zinc-500"}`}
          >
            <span
              aria-hidden
              className={`size-1.5 shrink-0 rounded-full ${
                status === "saved" ? "bg-emerald-500" : status === "error" || status === "closed" ? "bg-rose-500" : "bg-amber-400"
              }`}
            />
            {STATUS_TEXT[status]}
            {status === "saved" && ` · ${time}`}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={disabled || running !== null}
            title={`用範例測資執行（${isMac ? "⌘" : "Ctrl"} + Enter）`}
            className="flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {running === "run" ? <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <span aria-hidden>▶</span>}
            執行
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || running !== null}
            title="用隱藏測資測試"
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running === "submit" && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            提交測試
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
