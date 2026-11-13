import { checkAs, setStay } from "@/lib/round";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.as && !checkAs(body.as, body.key ?? "")) return Response.json({ error: "this link is not active" }, { status: 403 });
  const res = setStay(String(body.as ?? body.id ?? ""), body.stay === true);
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  return Response.json({ ok: true });
}
