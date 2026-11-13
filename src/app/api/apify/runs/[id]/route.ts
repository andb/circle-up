import { isOrganiser, unauthorized } from "@/lib/auth";
import { apifyItems, apifyRun, mode } from "@/lib/sponsor";

export const maxDuration = 300;

// Answers the run's status; items only once it has SUCCEEDED.
export async function GET(request: Request, { params }: RouteContext<"/api/apify/runs/[id]">) {
  if (!isOrganiser(request, true)) return unauthorized();
  try {
    const run = await apifyRun((await params).id);
    const items = run.status === "SUCCEEDED" ? await apifyItems(run.datasetId) : undefined;
    return Response.json({ status: run.status, ...(items ? { items } : {}), mode: mode() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
