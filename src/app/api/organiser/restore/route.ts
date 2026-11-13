import { isOrganiser, unauthorized } from "@/lib/auth";
import { restoreHistory } from "@/lib/round";

export async function POST(request: Request) {
  if (!isOrganiser(request)) return unauthorized();
  const body = await request.json().catch(() => undefined);
  if (body === undefined) return Response.json({ error: "this file is not JSON" }, { status: 400 });
  const res = restoreHistory(body);
  return res.ok ? Response.json(res.value) : Response.json({ error: res.error }, { status: res.status });
}
