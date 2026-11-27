import { auth } from "@/auth";
import { parseAutosavePayload } from "@/lib/attempts/edit-history";
import { saveAutosave } from "@/lib/attempts/repository";

/** Saves the current code and the edit history recorded since the last save. */
export async function POST(request: Request, context: RouteContext<"/api/attempts/[id]/autosave">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "資料格式錯誤" }, { status: 400 });
  }
  const payload = parseAutosavePayload(body);
  if (!payload) {
    return Response.json({ error: "資料格式錯誤或程式碼過長" }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await saveAutosave(id, session.user.id, payload);
  if (!result.ok) {
    return result.reason === "closed"
      ? Response.json({ error: "這份作答已經結束，無法再修改" }, { status: 409 })
      : Response.json({ error: "找不到這份作答" }, { status: 404 });
  }
  return Response.json({ savedAt: result.savedAt });
}
