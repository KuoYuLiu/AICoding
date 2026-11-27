/** Chat values shared by the server and the browser. No server-only imports here. */

export const MAX_MESSAGE_CHARS = 1000;

export const GREETING = "嗨！我是這一題的 AI 助理。我不會直接給你答案，但會陪你一步步想出來。先用你自己的話告訴我：這一題要你做什麼？";

export interface ChatMessageView {
  id: string;
  role: "student" | "assistant";
  content: string;
  createdAt: string;
}
