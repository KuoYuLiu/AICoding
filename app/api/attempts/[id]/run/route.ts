import { handleRunRequest } from "@/lib/attempts/run-route";

/** Runs the code against the sample test cases and returns full detail. */
export async function POST(request: Request, context: RouteContext<"/api/attempts/[id]/run">) {
  const { id } = await context.params;
  return handleRunRequest(request, id, "run");
}
