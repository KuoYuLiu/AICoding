import { handleRunRequest } from "@/lib/attempts/run-route";

/** Runs the code against the hidden test cases and returns verdicts only. */
export async function POST(request: Request, context: RouteContext<"/api/attempts/[id]/submit">) {
  const { id } = await context.params;
  return handleRunRequest(request, id, "submit");
}
