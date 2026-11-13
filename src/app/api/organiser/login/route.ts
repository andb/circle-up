import { COOKIE, matchesSecret, sessionToken } from "@/lib/auth";
import { allow, clientAddress } from "@/lib/round";

function back(location: string, cookie?: string): Response {
  const headers = new Headers({ Location: location });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  if (!allow(`login:${clientAddress(request)}`, 5)) return back("/organiser?e=wait");
  const form = await request.formData().catch(() => null);
  const password = form?.get("password");
  const token = sessionToken();
  if (!token || typeof password !== "string" || !matchesSecret(password)) return back("/organiser?e=wrong");
  const secure = request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:";
  const cookie = `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure ? "; Secure" : ""}`;
  return back("/organiser", cookie);
}
