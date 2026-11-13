import { isOrganiser, unauthorized } from "@/lib/auth";
import { exportHistory } from "@/lib/round";


export function GET(request: Request) {
  if (!isOrganiser(request)) return unauthorized();
  const data = exportHistory();
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="circle-up-history-${data.eventCode}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
