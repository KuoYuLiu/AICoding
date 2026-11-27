import { auth } from "@/auth";
import { runAttempt, type RunKind } from "./run";

/** Shared handler for POST /api/attempts/[id]/run and /submit. */
export async function handleRunRequest(request: Request, attemptId: string, kind: RunKind): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  let code: unknown;
  try {
    code = ((await request.json()) as { code?: unknown }).code;
  } catch {
    code = undefined;
  }
  if (typeof code !== "string") {
    return Response.json({ error: "資料格式錯誤" }, { status: 400 });
  }

  const outcome = await runAttempt(attemptId, session.user.id, kind, code);
  if (outcome.ok) return Response.json(outcome.view);

  switch (outcome.reason) {
    case "rate_limited":
      return Response.json(
        { error: `執行太頻繁了，請 ${outcome.retryAfterSec} 秒後再試。先想一想程式哪裡可能有問題吧！`, retryAfterSec: outcome.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(outcome.retryAfterSec) } },
      );
    case "too_long":
      return Response.json({ error: "程式碼太長了" }, { status: 413 });
    case "closed":
      return Response.json({ error: "這份作答已經結束，無法再執行" }, { status: 409 });
    default:
      return Response.json({ error: "找不到這份作答" }, { status: 404 });
  }
}
