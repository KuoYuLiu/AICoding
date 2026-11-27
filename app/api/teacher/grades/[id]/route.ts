import { auth } from "@/auth";
import { applyReviewAction, parseReviewAction } from "@/lib/grading/review";

// A regrade waits for the AI grader.
export const maxDuration = 120;

const ERRORS = {
  not_found: { status: 404, error: "找不到這份成績" },
  not_latest: { status: 409, error: "這不是最新版本，請重新整理頁面" },
  invalid_state: { status: 409, error: "目前的狀態不能進行這個動作，請重新整理頁面" },
  invalid_input: { status: 400, error: "資料格式錯誤" },
  grading_failed: { status: 502, error: "AI 評分失敗，請稍後再試一次" },
} as const;

/** Teacher review actions on one grade version: edit, regrade, retry, confirm, publish. */
export async function POST(request: Request, context: RouteContext<"/api/teacher/grades/[id]">) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "請先登入" }, { status: 401 });
  if (session.user.role !== "TEACHER") return Response.json({ error: "只有老師可以審核成績" }, { status: 403 });

  const action = parseReviewAction(await request.json().catch(() => null));
  if (!action) return Response.json({ error: ERRORS.invalid_input.error }, { status: 400 });

  const { id } = await context.params;
  const outcome = await applyReviewAction(id, session.user.email, action);
  if (outcome.ok) return Response.json({ gradeId: outcome.gradeId });
  const failure = ERRORS[outcome.reason];
  return Response.json({ error: failure.error }, { status: failure.status });
}
