import { checkAs, currentRound, withdraw } from "@/lib/round";
import { capture } from "@/lib/analytics";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.as && !checkAs(body.as, body.key ?? "")) return Response.json({ error: "this link is not active" }, { status: 403 });
  const res = withdraw(String(body.as ?? body.id ?? ""));
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  void capture("withdrawn", { round: currentRound().number });
  return Response.json({ ok: true });
}
