"use client";

import { useCallback, useEffect, useState } from "react";
import { RatingForm } from "@/components/rating-form";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Member = { ref: number; name: string; talk: string; linkedin: string; github: string; website: string; me: boolean; withdrawn: boolean };
type Profile = {
  read: { state: "reading" | "done"; linkedin: boolean; github: boolean; website: boolean } | null;
  summary: string;
  gave: { linkedin: boolean; github: boolean; website: boolean };
};
type Mutual = { name: string; linkedin: string; email: string };
type RoundView = {
  round: number;
  status: string;
  rulesVersion: number | null;
  group: { number: number; spot: { name: string; description: string }; themes: string[]; members: Member[] } | null;
  myRating: { worth: number; peers: { ref: number; again: 0 | 1 }[] } | null;
};

export function EveningPage({ as, asKey }: { as?: string; asKey?: string }) {
  const [who, setWho] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundView[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mutual, setMutual] = useState<Mutual[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (as) setWho(`as=${encodeURIComponent(as)}&key=${encodeURIComponent(asKey ?? "")}`);
    else {
      const id = localStorage.getItem("circle-up-id");
      setWho(id ? `id=${encodeURIComponent(id)}` : "");
    }
  }, [as, asKey]);

  const refresh = useCallback(async () => {
    if (!who) return;
    const res = await fetch(`/api/evening?${who}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setRounds(data.rounds);
      setProfile(data.profile);
      setMutual(data.mutual ?? []);
    }
  }, [who]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const back = as ? `/join?as=${encodeURIComponent(as)}&key=${encodeURIComponent(asKey ?? "")}` : "/join";
  const identity = as ? { as, key: asKey } : { id: typeof window === "undefined" ? null : localStorage.getItem("circle-up-id") };

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-primary text-4xl leading-tight">My evening</h1>
        <p className="text-lg leading-snug">Your groups tonight and the people in them. Kept until the organiser ends the event; take a screenshot to keep it.</p>
        <a className="text-primary text-lg font-bold underline underline-offset-4" href={back}>Back to this round</a>
      </header>
      {who === "" && <p>Join first, then your groups appear here.</p>}
      {mutual.length > 0 && <MutualCard people={mutual} />}
      {profile && <ProfileNote profile={profile} />}
      {rounds?.length === 0 && (
        <div className="bg-secondary flex flex-col gap-4 rounded-3xl px-5 py-7">
          <div className="flex gap-1.5"><span className="bg-primary size-7 rounded-full" /><span className="bg-primary/70 size-7 rounded-full" /><span className="bg-primary/40 size-7 rounded-full" /></div>
          <p className="font-heading text-primary text-2xl leading-snug">Nothing yet. Your groups will appear here.</p>
        </div>
      )}
      {rounds && [...rounds].reverse().map((r) => <RoundCard key={r.round} r={r} identity={identity} onSaved={refresh} />)}
      {error && <p className="text-destructive">{error}</p>}
    </main>
  );
}

function RoundCard({ r, identity, onSaved }: { r: RoundView; identity: object; onSaved: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const others = r.group?.members.filter((m) => !m.me) ?? [];
  const sheet = others.find((m) => m.ref === open) ?? null;
  const links = sheet ? [["LinkedIn", sheet.linkedin], ["GitHub", sheet.github], ["Site", sheet.website]].filter(([, href]) => href) : [];

  return (
    <Card className="gap-1.5 rounded-3xl px-4 pt-4 pb-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="rounded-full bg-secondary px-3 py-1 text-base font-bold text-secondary-foreground">Round {r.round}</span>
        {r.group && <span className="text-muted-foreground text-sm font-bold">Group {r.group.number}, {r.group.spot.name}</span>}
      </div>
      <CardContent className="flex flex-col gap-1.5 px-0">
        {!r.group ? (
          <p className="text-muted-foreground px-1 py-2 text-lg">{r.status === "open" || r.status === "locked" ? "Groups are not out yet." : "You were not in a group this round."}</p>
        ) : (
          <>
            <p className="px-1 pt-1.5 pb-2 text-lg leading-snug font-bold">{r.group.themes.join(", ")}</p>
            <ul className="flex flex-col">
              {others.map((m) => (
                <li key={m.ref} className="border-t">
                  <button className="flex h-15 w-full items-center gap-3 px-2 text-left" onClick={() => setOpen(m.ref)}>
                    <span className="bg-secondary text-secondary-foreground font-heading flex size-10 flex-none items-center justify-center rounded-full text-xl">{m.name.charAt(0)}</span>
                    <span className="flex-1 text-xl font-bold">{m.name}{m.withdrawn && " (left)"}</span>
                    <ChevronRight className="text-primary size-5.5" strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
            {(r.status === "published" || r.status === "ended") && (
              <div className="border-t px-2 py-3">
                <RatingForm round={r.round} peers={others.map((m) => ({ ref: m.ref, name: m.name }))} myRating={r.myRating} identity={identity} onSaved={onSaved} />
              </div>
            )}
          </>
        )}
      </CardContent>
      {sheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-foreground/50" onClick={() => setOpen(null)}>
          <div className="bg-background mx-auto flex w-full max-w-md flex-col gap-5 rounded-t-3xl px-6 pt-3.5 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="bg-border mx-auto h-1.5 w-11 rounded-full" />
            <div className="flex flex-col gap-2">
              <span className="text-primary text-base font-bold">Round {r.round}</span>
              <h2 className="font-heading text-primary text-3xl leading-tight">{sheet.name}{sheet.withdrawn && " (left)"}</h2>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-base font-bold">To talk about</div>
              <div className="text-xl leading-snug">{sheet.talk}</div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-base font-bold">Profile addresses</div>
              {links.length === 0 && <div className="bg-muted rounded-xl px-3.5 py-3 text-lg">No profile addresses shared</div>}
              {links.map(([label, href]) => (
                <a key={label} className="bg-card hover:bg-secondary flex min-h-13 items-center gap-3 rounded-xl border-2 px-3.5" href={href} target="_blank" rel="noreferrer noopener">
                  <span className="w-21 flex-none text-base font-bold">{label}</span>
                  <span className="text-primary min-w-0 flex-1 text-lg font-bold break-words underline underline-offset-4">{href}</span>
                </a>
              ))}
            </div>
            <Button className="h-14 w-full rounded-2xl text-xl font-bold" onClick={() => setOpen(null)}>Close</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function MutualCard({ people }: { people: Mutual[] }) {
  return (
    <Card className="gap-3 rounded-3xl px-4 py-4">
      <h2 className="font-heading text-primary px-1 text-2xl leading-tight">You both want to meet again</h2>
      <ul className="flex flex-col">
        {people.map((m, i) => (
          <li key={i} className="flex flex-col gap-1 border-t px-1 py-3">
            <span className="text-xl font-bold">{m.name}</span>
            {m.linkedin && <a className="text-primary text-lg break-all underline underline-offset-4" href={m.linkedin} target="_blank" rel="noreferrer noopener">{m.linkedin}</a>}
            {m.email && <a className="text-primary text-lg break-all underline underline-offset-4" href={`mailto:${m.email}`}>{m.email}</a>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ProfileNote({ profile }: { profile: Profile }) {
  const { read, gave, summary } = profile;
  if (!read || (!gave.linkedin && !gave.github && !gave.website)) return null;
  if (read.state === "reading") return <p className="text-muted-foreground text-sm">Reading the profile pages you gave...</p>;
  const mark = (given: boolean, ok: boolean, label: string) => (given ? `${label} ${ok ? "✓" : "✗"}` : null);
  const parts = [mark(gave.github, read.github, "GitHub"), mark(gave.website, read.website, "personal site"), mark(gave.linkedin, read.linkedin, "LinkedIn")].filter(Boolean);
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 text-sm">
        <p>We read: {parts.join(" / ")}</p>
        {summary ? <p className="text-muted-foreground">Only you and the organiser see this summary, which the grouping uses: {summary}</p> : <p className="text-muted-foreground">No summary this time; grouping uses what you wrote.</p>}
      </CardContent>
    </Card>
  );
}
