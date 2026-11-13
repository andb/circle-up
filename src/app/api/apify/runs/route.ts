import { isOrganiser, unauthorized } from "@/lib/auth";
import { apifyStart, mode } from "@/lib/sponsor";

export const maxDuration = 300;

// Starts a long Apify run; the caller polls /api/apify/runs/[id].
export async function POST(request: Request) {
  if (!isOrganiser(request, true)) return unauthorized();
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json({ id: await apifyStart(body?.query), mode: mode() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
