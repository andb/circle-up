import { isOrganiser, unauthorized } from "@/lib/auth";
import { organiserState } from "@/lib/round";


export function GET(request: Request) {
  if (!isOrganiser(request)) return unauthorized();
  return Response.json(organiserState());
}
