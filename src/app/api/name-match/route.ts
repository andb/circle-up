import { answerNameSearch } from "@/lib/name-matches";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body || typeof body.id !== "string" || (body.answer !== "yes" && body.answer !== "no")) return Response.json({ error: "bad request" }, { status: 400 });
  const res = answerNameSearch(body.id, body.answer === "yes");
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  return Response.json({ ok: true, linked: res.linked });
}
