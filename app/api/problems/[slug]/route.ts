import { auth } from "@/auth";
import { getPublicProblem } from "@/lib/problems/repository";

export async function GET(_request: Request, context: RouteContext<"/api/problems/[slug]">) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "請先登入" }, { status: 401 });
  }

  const { slug } = await context.params;
  const problem = await getPublicProblem(slug);
  if (!problem) {
    return Response.json({ error: "找不到這個題目" }, { status: 404 });
  }
  return Response.json(problem);
}
