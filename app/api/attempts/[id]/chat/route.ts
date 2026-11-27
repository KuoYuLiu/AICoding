import { auth } from "@/auth";
import { respond } from "@/lib/ai/assistant";

/** Sends one student message to the AI assistant and returns its checked reply. */
export async function POST(request: Request, context: RouteContext<"/api/attempts/[id]/chat">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  let message: unknown;
  try {
    message = ((await request.json()) as { message?: unknown }).message;
  } catch {
    message = undefined;
  }
  if (typeof message !== "string") {
    return Response.json({ error: "資料格式錯誤" }, { status: 400 });
  }

  const { id } = await context.params;
  let outcome;
  try {
    outcome = await respond(id, session.user.id, message);
  } catch (error) {
    console.error("assistant failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "AI 助理暫時無法回應，請稍後再試一次。" }, { status: 502 });
  }
  if (outcome.ok) return Response.json({ reply: outcome.reply, stage: outcome.stage });

  switch (outcome.reason) {
    case "rate_limited":
      return Response.json(
        { error: `訊息傳太快了，請 ${outcome.retryAfterSec} 秒後再試。`, retryAfterSec: outcome.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(outcome.retryAfterSec) } },
      );
    case "empty":
      return Response.json({ error: "請先輸入訊息" }, { status: 400 });
    case "too_long":
      return Response.json({ error: "訊息太長了，請精簡到 1000 字以內" }, { status: 413 });
    case "closed":
      return Response.json({ error: "這份作答已經結束" }, { status: 409 });
    default:
      return Response.json({ error: "找不到這份作答" }, { status: 404 });
  }
}
