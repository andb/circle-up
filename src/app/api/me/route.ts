import { checkAs, participantView } from "@/lib/round";


export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const as = q.get("as");
  if (as && !checkAs(as, q.get("key") ?? "")) return Response.json({ error: "this link is not active" }, { status: 403 });
  const id = as ?? q.get("id") ?? "";
  return Response.json(participantView(id));
}
