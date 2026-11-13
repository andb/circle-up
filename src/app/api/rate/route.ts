import { checkAs, getEvent, rate } from "@/lib/round";
import { capture } from "@/lib/analytics";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.as && !checkAs(body.as, body.key ?? "")) return Response.json({ error: "this link is not active" }, { status: 403 });
  const id = String(body.as ?? body.id ?? "");
  const res = rate(id, Number(body.round), body.worth, body.peers);
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  const r = getEvent().rounds.find((x) => x.number === res.value.round);
  void capture("group_rated", {
    round: res.value.round,
    rules_version: r?.rulesVersion ?? 0,
    worth: res.value.worth,
    again_yes: res.value.peers.filter((p) => p.again === 1).length,
    again_answers: res.value.peers.length,
    simulated: 0,
    synthetic: r?.synthetic ? 1 : 0,
  });
  return Response.json({ ok: true });
}
