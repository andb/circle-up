import { allow, clientAddress, currentRound, join } from "@/lib/round";
import { capture } from "@/lib/analytics";
import { startProfileRead } from "@/lib/profiles";
import { startNameSearch } from "@/lib/name-matches";


const LIMITED = "too many joins, try again in a minute";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "bad request" }, { status: 400 });
  const browser = typeof body.id === "string" ? body.id : "";
  const okBrowser = !browser || allow(`browser:${browser}`, 5);
  const okAddress = allow(`address:${clientAddress(request)}`, 120);
  const okOverall = allow("overall", 300);
  if (!okBrowser || !okAddress || !okOverall) return Response.json({ error: LIMITED }, { status: 429 });
  const round = currentRound();
  const before = round.participants.length;
  const res = join(body);
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  startProfileRead(res.value);
  startNameSearch(res.value);
  if (round.participants.length > before) void capture("joined", { round: round.number, synthetic: round.synthetic ? 1 : 0 });
  return Response.json({ id: res.value.id });
}
