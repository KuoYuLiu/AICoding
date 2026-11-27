import { after } from "next/server";
import { auth } from "@/auth";
import { gradeVersion } from "@/lib/ai/grader";
import { finishAttempt } from "@/lib/attempts/finish";

/** Ends the attempt and starts AI grading in the background. */
export async function POST(_request: Request, context: RouteContext<"/api/attempts/[id]/finish">) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }
  const { id } = await context.params;
  const outcome = await finishAttempt(id, session.user.id);
  if (!outcome.ok) {
    return outcome.reason === "closed"
      ? Response.json({ error: "這份作答已經結束" }, { status: 409 })
      : Response.json({ error: "找不到這份作答" }, { status: 404 });
  }

  // Grading takes a while; the student does not wait for it. A failure leaves the grade pending for the teacher to retry.
  after(async () => {
    try {
      await gradeVersion(outcome.gradeId);
    } catch (error) {
      console.error("grading failed", error instanceof Error ? error.message : error);
    }
  });
  return Response.json({ status: outcome.status });
}
