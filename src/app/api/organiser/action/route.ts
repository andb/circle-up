import { isOrganiser, unauthorized } from "@/lib/auth";
import { currentRound, endEvent, endRound, formCurrentRound, lockRound, publishRound, simulateCurrent, updateSpots } from "@/lib/round";
import { improveRules, runForming } from "@/lib/matching";
import { capture, captureAll } from "@/lib/analytics";

export const maxDuration = 300;

function reply(res: { ok: true } | { ok: false; error: string; status: number }) {
  return res.ok ? Response.json({ ok: true }) : Response.json({ error: res.error }, { status: res.status });
}

export async function POST(request: Request) {
  if (!isOrganiser(request)) return unauthorized();
  const body = await request.json().catch(() => ({}));
  switch (body.action) {
    case "lock": {
      const res = lockRound();
      return res.ok ? Response.json({ ok: true }) : Response.json({ error: res.error }, { status: res.status });
    }
    case "end-round":
      endRound();
      return Response.json({ ok: true });
    case "end-event":
      endEvent();
      return Response.json({ ok: true });
    case "spots": {
      const res = updateSpots(body.spots);
      return res.ok ? Response.json({ ok: true }) : Response.json({ error: res.error }, { status: res.status });
    }
    case "form": {
      const res = await formCurrentRound(runForming);
      if (res.ok && res.value.groups) {
        const r = res.value;
        const groups = r.groups ?? [];
        const by = (f: string) => groups.filter((gr) => gr.formedBy === f).length;
        void capture("groups_formed", {
          round: r.number,
          rules_version: r.rulesVersion ?? 0,
          group_count: groups.length,
          sizes: groups.map((gr) => gr.memberIds.length),
          formed_by_model: by("model"),
          formed_by_repaired: by("repaired"),
          formed_by_fallback: by("fallback"),
          synthetic: r.synthetic ? 1 : 0,
        });
      }
      return reply(res);
    }
    case "publish":
      return reply(publishRound());
    case "simulate": {
      const res = simulateCurrent();
      if (res.ok) {
        const r = res.value;
        void captureAll("group_rated", r.map((x) => ({
          round: x.round,
          rules_version: currentRound().rulesVersion ?? 0,
          worth: x.worth,
          again_yes: x.peers.filter((p) => p.again === 1).length,
          again_answers: x.peers.length,
          simulated: 1,
          synthetic: 1,
        })));
      }
      return reply(res);
    }
    case "rewrite": {
      const out = await improveRules();
      return out.ok ? Response.json(out) : Response.json(out, { status: 409 });
    }
    default:
      return Response.json({ error: "unknown action" }, { status: 400 });
  }
}
