import { connection } from "next/server";
import { currentRound, getEvent } from "@/lib/round";

export async function GET() {
  await connection();
  return Response.json({ eventCode: getEvent().code, round: currentRound().number });
}
