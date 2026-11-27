"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GREETING, MAX_MESSAGE_CHARS as MAX_CHARS, type ChatMessageView } from "@/lib/ai/chat-constants";
import { STAGES } from "./stages";
import type { ChatState } from "./use-chat";

const STARTERS = ["我不太懂這題要做什麼", "我不知道要用什麼語法", "我的程式跑出錯誤了"];

interface AssistantPaneProps {
  chat: ChatState;
  disabled: boolean;
  onSend: (message: string) => Promise<boolean>;
  onDismissError: () => void;
}

export function AssistantPane({ chat, disabled, onSend, onDismissError }: AssistantPaneProps) {
  const current = STAGES.find((item) => item.id === chat.stage) ?? STAGES[0];
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const tooLong = draft.length > MAX_CHARS;
  const canSend = !disabled && !chat.sending && draft.trim().length > 0 && !tooLong;

  // Keep the newest message in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [chat.messages.length, chat.sending]);

  // A hidden pane (phone tabs) has no height; jump to the newest message once it is shown.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let wasHidden = list.clientHeight === 0;
    const observer = new ResizeObserver(() => {
      const hidden = list.clientHeight === 0;
      if (wasHidden && !hidden) list.scrollTop = list.scrollHeight;
      wasHidden = hidden;
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  // Grow the input with its content, up to about six lines.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    // A hidden pane measures 0; leave the natural one-line height then.
    if (input.scrollHeight > 0) input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
  }, [draft]);

  const submit = async (text: string) => {
    if (disabled || chat.sending || !text.trim() || text.length > MAX_CHARS) return;
    const accepted = await onSend(text);
    if (accepted) setDraft((value) => (value === text ? "" : value));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter adds a line. Never send while an input method is composing (注音、倉頡).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit(draft);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden className="grid size-6 place-items-center rounded-full bg-indigo-600 text-[11px] font-bold text-white">
              AI
            </span>
            AI 助理
          </h2>
          <span className="text-xs text-zinc-500" data-testid="stage-label">
            階段 {current.id} / {STAGES.length}
          </span>
        </div>
        <ol className="mt-3 flex gap-1" aria-label="解題階段">
          {STAGES.map((item) => (
            <li key={item.id} className="flex-1" title={`${item.id}. ${item.name}`}>
              <span
                className={`block h-1.5 rounded-full transition-colors duration-500 ${
                  item.id < current.id
                    ? "bg-indigo-500"
                    : item.id === current.id
                      ? "bg-indigo-300 dark:bg-indigo-400/60"
                      : "bg-zinc-200 dark:bg-zinc-800"
                }`}
              />
              <span className="sr-only">
                {item.name}
                {item.id === current.id ? "（目前階段）" : ""}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{current.name}</span>：{current.hint}
        </p>
      </div>

      <div ref={listRef} role="log" aria-label="對話紀錄" aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Bubble role="assistant" content={GREETING} />
        {chat.messages.map((message) => (
          <Bubble key={message.id} role={message.role} content={message.content} />
        ))}
        {chat.sending && <TypingIndicator />}
        {chat.messages.length === 0 && !chat.sending && !disabled && (
          <div className="flex flex-wrap gap-2 pl-8" aria-label="建議的開場">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => void submit(starter)}
                className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
              >
                {starter}
              </button>
            ))}
          </div>
        )}
      </div>

      {chat.error && (
        <div
          role="alert"
          className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        >
          <span className="flex-1">{chat.error}</span>
          <button type="button" onClick={onDismissError} aria-label="關閉錯誤訊息" className="rounded px-1 text-rose-500 hover:text-rose-700 dark:hover:text-rose-100">
            ✕
          </button>
        </div>
      )}

      <form
        className="border-t border-zinc-200 p-3 dark:border-zinc-800"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(draft);
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">
          輸入訊息給 AI 助理
        </label>
        <div
          className={`flex items-end gap-2 rounded-xl border bg-white px-3 py-2 transition focus-within:ring-2 dark:bg-zinc-900 ${
            tooLong
              ? "border-rose-400 focus-within:ring-rose-500/30"
              : "border-zinc-300 focus-within:border-indigo-400 focus-within:ring-indigo-500/20 dark:border-zinc-700"
          }`}
        >
          <textarea
            id="assistant-input"
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? "作答已結束" : "說說你的想法或卡住的地方…"}
            aria-describedby="assistant-input-help"
            className="max-h-36 min-w-0 flex-1 resize-none bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="送出"
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
            </svg>
          </button>
        </div>
        <p id="assistant-input-help" className="mt-1.5 flex justify-between text-[11px] text-zinc-400">
          <span>Enter 送出，Shift + Enter 換行</span>
          {draft.length > MAX_CHARS * 0.8 && (
            <span className={tooLong ? "font-medium text-rose-500" : ""}>
              {draft.length} / {MAX_CHARS}
            </span>
          )}
        </p>
      </form>
    </div>
  );
}

function Bubble({ role, content }: { role: ChatMessageView["role"]; content: string }) {
  if (role === "student") {
    return (
      <div className="flex justify-end" data-testid="chat-student">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-sm leading-relaxed text-white">
          {content}
        </p>
      </div>
    );
  }
  return (
    <div className="flex gap-2" data-testid="chat-assistant">
      <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
        AI
      </span>
      <div className="prose prose-sm prose-zinc min-w-0 max-w-[85%] rounded-2xl rounded-tl-md bg-zinc-100 px-3.5 py-2 leading-relaxed dark:prose-invert prose-p:my-1 prose-pre:my-2 prose-pre:bg-zinc-900 prose-pre:text-zinc-100 prose-ul:my-1 prose-ol:my-1 prose-code:before:content-none prose-code:after:content-none dark:bg-zinc-800/70">
        <span className="sr-only">AI 助理：</span>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2" data-testid="chat-typing">
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
        AI
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-zinc-100 px-3.5 py-3 dark:bg-zinc-800/70">
        <span className="sr-only">AI 助理正在思考…</span>
        {[0, 150, 300].map((delay) => (
          <span key={delay} aria-hidden className="size-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );
}
