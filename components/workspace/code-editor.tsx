"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useEffect, useRef } from "react";
import type { EditSample } from "@/lib/attempts/edit-history";

// Self-hosted copy (scripts/copy-monaco.mjs): no third-party CDN on school networks.
loader.config({ paths: { vs: "/monaco/vs" } });

export type BlockedInput = "paste" | "drop";

interface CodeEditorProps {
  /** Read once when the editor mounts (it may remount when the layout changes). */
  initialValue: () => string;
  language: string;
  dark: boolean;
  readOnly?: boolean;
  onChange: (code: string, edits: EditSample[]) => void;
  onBlockedInput: (kind: BlockedInput) => void;
  /** Ctrl/Cmd + Enter. */
  onRunShortcut?: () => void;
}

const OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  fontSize: 14,
  lineHeight: 22,
  fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, Consolas, monospace",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: 12 },
  tabSize: 4,
  insertSpaces: true,
  renderLineHighlight: "line",
  smoothScrolling: true,
  // No pasting or dropping text in: students type their own code.
  contextmenu: false,
  dragAndDrop: false,
  dropIntoEditor: { enabled: false },
  pasteAs: { enabled: false },
  // A plain textarea keeps the paste/drop DOM events below reliable across browsers.
  editContext: false,
  // Beginners learn more from typing than from completions.
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: "off",
  inlineSuggest: { enabled: false },
  parameterHints: { enabled: false },
  accessibilitySupport: "auto",
  ariaLabel: "程式編輯器",
};

/**
 * Monaco with paste, drop and the context menu disabled.
 * Every content change is reported with its inserted/deleted size for the edit history.
 */
export function CodeEditor({ initialValue, language, dark, readOnly = false, onChange, onBlockedInput, onRunShortcut }: CodeEditorProps) {
  const cleanup = useRef<(() => void) | null>(null);
  const callbacks = useRef({ initialValue, onChange, onBlockedInput, onRunShortcut });
  useEffect(() => {
    callbacks.current = { initialValue, onChange, onBlockedInput, onRunShortcut };
  });
  useEffect(() => () => cleanup.current?.(), []);

  const handleMount: OnMount = (instance, monaco) => {
    const node = instance.getDomNode();
    if (!node) return;

    const block = (kind: BlockedInput) => (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      callbacks.current.onBlockedInput(kind);
    };
    const blockPaste = block("paste");
    const blockDrop = block("drop");
    const refuseDrag = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    };
    const blockInsertFrom = (event: Event) => {
      const inputType = (event as InputEvent).inputType;
      if (inputType === "insertFromPaste" || inputType === "insertFromPasteAsQuotation") blockPaste(event);
      else if (inputType === "insertFromDrop") blockDrop(event);
    };
    const blockContextMenu = (event: Event) => event.preventDefault();

    // Capture phase: runs before Monaco's own handlers.
    node.addEventListener("paste", blockPaste, true);
    node.addEventListener("drop", blockDrop, true);
    node.addEventListener("dragover", refuseDrag, true);
    node.addEventListener("beforeinput", blockInsertFrom, true);
    node.addEventListener("contextmenu", blockContextMenu, true);

    // Keyboard shortcuts never reach the browser's paste.
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => callbacks.current.onBlockedInput("paste"));
    instance.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Insert, () => callbacks.current.onBlockedInput("paste"));
    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyV, () =>
      callbacks.current.onBlockedInput("paste"),
    );

    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => callbacks.current.onRunShortcut?.());

    // Last line of defence: if a paste slips through anyway, undo it.
    const pasteGuard = instance.onDidPaste(() => {
      instance.trigger("paste-guard", "undo", null);
      callbacks.current.onBlockedInput("paste");
    });

    // Set before listening, so loading the saved code is not recorded as an edit.
    instance.getModel()?.setValue(callbacks.current.initialValue());
    const changes = instance.onDidChangeModelContent((event) => {
      const kind = event.isUndoing ? "undo" : event.isRedoing ? "redo" : "edit";
      const at = Date.now();
      const edits = event.changes.map((change) => ({ at, inserted: change.text.length, deleted: change.rangeLength, kind }) as const);
      callbacks.current.onChange(instance.getValue(), edits);
    });

    cleanup.current = () => {
      node.removeEventListener("paste", blockPaste, true);
      node.removeEventListener("drop", blockDrop, true);
      node.removeEventListener("dragover", refuseDrag, true);
      node.removeEventListener("beforeinput", blockInsertFrom, true);
      node.removeEventListener("contextmenu", blockContextMenu, true);
      pasteGuard.dispose();
      changes.dispose();
    };
    instance.focus();
  };

  return (
    <Editor
      language={language}
      theme={dark ? "vs-dark" : "vs"}
      options={{ ...OPTIONS, readOnly }}
      onMount={handleMount}
      loading={<div className="grid h-full place-items-center text-sm text-zinc-500">編輯器載入中…</div>}
    />
  );
}
