import { checkAs, evening, mutualAgain, participantView } from "@/lib/round";

export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const as = q.get("as");
  if (as && !checkAs(as, q.get("key") ?? "")) return Response.json({ error: "this link is not active" }, { status: 403 });
  const id = as ?? q.get("id") ?? "";
  const p = participantView(id).participant;
  return Response.json({ rounds: evening(id), mutual: mutualAgain(id), profile: p ? { read: p.profileRead ?? null, summary: p.profileSummary ?? "", gave: { linkedin: !!p.linkedin, github: !!p.github, website: !!p.website } } : null });
}
