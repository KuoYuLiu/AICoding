"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessageView } from "@/lib/ai/chat-constants";

export interface ChatState {
  messages: ChatMessageView[];
  stage: number;
  sending: boolean;
  error: string | null;
}

/** Chat with the AI assistant. The student's message shows at once; the reply follows. */
export function useChat(attemptId: string, initial: { messages: ChatMessageView[]; stage: number }) {
  const [state, setState] = useState<ChatState>({ ...initial, sending: false, error: null });
  const busy = useRef(false);

  const send = useCallback(
    async (raw: string): Promise<boolean> => {
      const message = raw.trim();
      if (!message || busy.current) return false;
      busy.current = true;
      const pending: ChatMessageView = { id: `pending-${Date.now()}`, role: "student", content: message, createdAt: new Date().toISOString() };
      setState((current) => ({ ...current, messages: [...current.messages, pending], sending: true, error: null }));

      try {
        const response = await fetch(`/api/attempts/${attemptId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const data = (await response.json().catch(() => ({}))) as { reply?: ChatMessageView; stage?: number; error?: string };
        if (!response.ok || !data.reply) {
          // A message the server refused before saving (rate limit, too long) is taken back so it can be resent.
          const saved = response.status >= 500;
          setState((current) => ({
            ...current,
            messages: saved ? current.messages : current.messages.filter((item) => item.id !== pending.id),
            sending: false,
            error: data.error ?? "AI 助理暫時無法回應，請稍後再試一次。",
          }));
          return saved;
        }
        const reply = data.reply;
        setState((current) => ({
          messages: [...current.messages, reply],
          stage: data.stage ?? current.stage,
          sending: false,
          error: null,
        }));
        return true;
      } catch {
        setState((current) => ({
          ...current,
          messages: current.messages.filter((item) => item.id !== pending.id),
          sending: false,
          error: "連線中斷，請檢查網路後再試一次。",
        }));
        return false;
      } finally {
        busy.current = false;
      }
    },
    [attemptId],
  );

  const dismissError = useCallback(() => setState((current) => ({ ...current, error: null })), []);

  return { state, send, dismissError };
}
