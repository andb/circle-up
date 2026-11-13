import { isOrganiser, unauthorized } from "@/lib/auth";
import { currentRound, seed } from "@/lib/round";
import { captureAll } from "@/lib/analytics";

export function POST(request: Request) {
  if (!isOrganiser(request)) return unauthorized();
  const res = seed();
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
  const round = currentRound().number;
  void captureAll("joined", Array.from({ length: res.value }, () => ({ round, synthetic: 1 })));
  return Response.json({ count: res.value });
}
