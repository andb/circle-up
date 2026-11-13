import { isOrganiser, unauthorized } from "@/lib/auth";
import { apifySearch, mode } from "@/lib/sponsor";

export const maxDuration = 300;

// Organiser only: a session cookie, or the x-organiser-secret header for scripted checks.
export async function POST(request: Request) {
  if (!isOrganiser(request, true)) return unauthorized();
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json({ items: await apifySearch(body?.query), mode: mode() });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
