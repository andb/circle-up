import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export const COOKIE = "organiser";

function hash(v: string): Buffer {
  return createHash("sha256").update(v).digest();
}

function configured(): string {
  return (process.env.ORGANISER_SECRET ?? "").trim();
}

export function sessionToken(): string | null {
  const s = configured();
  return s ? hash(`circle-up-organiser-session:${s}`).toString("hex") : null;
}

export function matchesSecret(candidate: string | null | undefined): boolean {
  const s = configured();
  if (!s || !candidate) return false;
  return timingSafeEqual(hash(candidate), hash(s));
}

export function validSession(cookieValue: string | null | undefined): boolean {
  const t = sessionToken();
  if (!t || !cookieValue) return false;
  return timingSafeEqual(hash(cookieValue), hash(t));
}

function cookieFrom(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return undefined;
}

export function isOrganiser(request: Request, allowHeader = false): boolean {
  if (validSession(cookieFrom(request))) return true;
  return allowHeader && matchesSecret(request.headers.get("x-organiser-secret"));
}

export function unauthorized(): Response {
  return Response.json({ error: "organiser only" }, { status: 401 });
}
