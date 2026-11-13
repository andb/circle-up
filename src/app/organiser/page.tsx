import { cookies } from "next/headers";
import { COOKIE, validSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrganiserPanel } from "@/components/organiser-panel";

const MESSAGES: Record<string, string> = {
  wrong: "That did not match. Try again.",
  wait: "Too many attempts. Wait a minute.",
};

export const instant = false;

export default async function Organiser({ searchParams }: PageProps<"/organiser">) {
  const jar = await cookies();
  if (validSession(jar.get(COOKIE)?.value)) return <OrganiserPanel />;
  const q = await searchParams;
  const message = typeof q.e === "string" ? MESSAGES[q.e] : undefined;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-4 px-4 py-10">
      <h1 className="font-heading text-3xl font-semibold">Circle Up organiser</h1>
      <form method="post" action="/api/organiser/login" className="flex flex-col gap-3">
        <Label htmlFor="password">Organiser password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
        <Button type="submit" className="h-11">Log in</Button>
      </form>
      {message && <p className="text-destructive">{message}</p>}
    </main>
  );
}
