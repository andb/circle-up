"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { consentLine, noticeItems } from "@/lib/notice";

type Participant = {
  id: string;
  name: string;
  talk: string;
  linkedin: string;
  github: string;
  website: string;
  email?: string;
  status: "in" | "withdrawn";
  stay: boolean;
  profileSummary?: string;
  profileRead?: { state: "reading" | "done"; linkedin: boolean; github: boolean; website: boolean; reasons?: Partial<Record<LinkKind, string>> };
  nameSearch?: { state: "searching" | "ask" | "done"; candidate?: NameCandidate };
};
type NameCandidate = { headline: string; company?: string; location?: string; url: string };
type LinkKind = "linkedin" | "github" | "website";
type Group = { number: number; spot: { name: string; description: string }; themes: string[]; members: { ref: number; name: string; me: boolean; withdrawn: boolean }[] };
type View = { round: number; roundStatus: string; rulesVersion: number | null; joined: boolean; participant: Participant | null; group: Group | null };

const STORE = "circle-up-id";
const OFFLINE = "No connection. Try again.";

export function JoinPage({ as, asKey, nameSearch = false }: { as?: string; asKey?: string; nameSearch?: boolean }) {
  const [id, setId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = useRef<HTMLDialogElement>(null);
  const [profileStep, setProfileStep] = useState<number | null>(null);
  const [form, setForm] = useState({ code: "", name: "", talk: "", linkedin: "", github: "", website: "", email: "" });

  const who = as ? `as=${encodeURIComponent(as)}&key=${encodeURIComponent(asKey ?? "")}` : id ? `id=${encodeURIComponent(id)}` : null;
  const whoBody = as ? { as, key: asKey } : { id };

  useEffect(() => {
    if (as) return;
    setId(localStorage.getItem(STORE));
    const fromLink = new URLSearchParams(window.location.search).get("code");
    const code = fromLink && /^\d{4}$/.test(fromLink) ? fromLink : localStorage.getItem(`${STORE}-code`);
    if (code) setForm((f) => ({ ...f, code }));
  }, [as]);

  const refresh = useCallback(async () => {
    if (!who) return;
    const res = await fetch(`/api/me?${who}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setView(data);
  }, [who]);

  useEffect(() => {
    if (!who) return;
    refresh();
    const t = setInterval(refresh, profileStep ? 2000 : 3000);
    return () => clearInterval(t);
  }, [who, refresh, profileStep]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: id ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      localStorage.setItem(STORE, data.id);
      localStorage.setItem(`${STORE}-code`, form.code);
      setId(data.id);
      setProfileStep(form.linkedin.trim() || form.github.trim() || form.website.trim() ? Date.now() : null);
      setEditing(false);
      setView(null);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  async function post(path: string, extra: object = {}) {
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...whoBody, ...extra }),
      });
      if (!res.ok) setError((await res.json()).error);
    } catch {
      setError(OFFLINE);
    }
    refresh();
  }

  async function answerMatch(yes: boolean) {
    if (!id) return;
    setError(null);
    try {
      const res = await fetch("/api/name-match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, answer: yes ? "yes" : "no" }) });
      const data = await res.json();
      if (!res.ok) setError(data.error);
      else if (data.linked) setProfileStep(Date.now());
    } catch {
      setError(OFFLINE);
    }
    refresh();
  }

  function startEdit(p: Participant) {
    setForm((f) => ({ ...f, name: p.name, talk: p.talk, linkedin: p.linkedin, github: p.github, website: p.website, email: p.email ?? "" }));
    setEditing(true);
  }

  const p = view?.participant;
  const joined = !!p && !editing;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const waiting = joined && p.status === "in" && !view.group && (view.roundStatus === "open" || view.roundStatus === "locked");
  const fieldClass = "h-14 rounded-[14px] border-2 bg-white px-4 text-[19px] md:text-[19px]";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-7 px-5 pt-6 pb-8">
      <header className="flex flex-col gap-1.5">
        {joined ? (
          <h1 className="font-heading text-brand-ink text-[22px]">Circle Up</h1>
        ) : (
          <>
            <h1 className="font-heading text-brand-ink text-[40px] leading-[1.1]">Circle Up</h1>
            <p className="text-xl leading-snug text-pretty">Meet a few people here tonight, in small groups, over a few rounds.</p>
          </>
        )}
        {as && <p className="text-base font-bold">Demo: acting as a synthetic participant.</p>}
      </header>

      {joined && !as && view.roundStatus === "open" && p.nameSearch?.state === "ask" && p.nameSearch.candidate ? (
        <MatchStep c={p.nameSearch.candidate} onAnswer={answerMatch} />
      ) : joined && profileStep ? (
        <ProfileStep p={p} since={profileStep} onContinue={() => setProfileStep(null)} />
      ) : joined ? (
        <section className="flex flex-1 flex-col gap-7">
          {waiting && <Circles />}
          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-brand-ink text-[34px] leading-[1.1] text-pretty">
              {p.status === "withdrawn" ? "You have left this round" : `You're in round ${view.round}, ${p.name}`}
            </h2>
            {p.status === "in" && (
              <p className="flex items-start gap-3 text-xl leading-snug">
                {waiting && <span className="cu-motion bg-primary mt-2 size-3 flex-none rounded-full" style={{ animation: "cu-pulse 2s ease-out infinite" }} />}
                <span>
                  {view.roundStatus === "open" && "Waiting for the organiser to form groups. Keep this page open."}
                  {view.roundStatus === "locked" && "The round is locked. Groups are being formed."}
                  {view.roundStatus === "published" && !view.group && "Groups are out. Look at the screen."}
                  {view.roundStatus === "ended" && "This round has ended."}
                </span>
              </p>
            )}
          </div>
          {p.status === "in" && view.group && (
            <div className="bg-tint flex flex-col gap-2 rounded-2xl p-4">
              <p className="font-heading text-brand-ink text-2xl">
                Group {view.group.number}: {view.group.spot.name}
              </p>
              <p className="text-muted-foreground text-lg">{view.group.spot.description}</p>
              <p className="text-lg">Talk about: {view.group.themes.join(" · ")}</p>
              <p className="text-lg">
                With:{" "}
                {view.group.members.filter((m) => !m.me).map((m) => (m.withdrawn ? `${m.name} (left)` : m.name)).join(", ")}
              </p>
            </div>
          )}
          <a className="text-primary text-lg font-bold underline underline-offset-4" href={as ? `/evening?as=${encodeURIComponent(as)}&key=${encodeURIComponent(asKey ?? "")}` : "/evening"}>
            My evening: your groups, the people you met, and ratings
          </a>
          <div className="mt-auto flex flex-col gap-3">
            {p.status === "in" && (
              <label className="bg-tint flex min-h-14 items-center gap-3 rounded-2xl px-4 text-lg font-bold">
                <input
                  type="checkbox"
                  className="accent-primary size-6"
                  checked={p.stay}
                  onChange={(e) => post("/api/stay", { stay: e.target.checked })}
                />
                Stay for the next round
              </label>
            )}
            {view.roundStatus === "open" && p.status === "in" && !as && (
              <Button variant="secondary" className="h-14 rounded-2xl text-lg font-bold" onClick={() => startEdit(p)}>
                Change my answers
              </Button>
            )}
            {p.status === "withdrawn" && view.roundStatus === "open" && !as && (
              <Button className="h-[58px] rounded-2xl text-xl font-bold" onClick={() => startEdit(p)}>
                Join again
              </Button>
            )}
            {p.status === "in" && (
              <Button variant="ghost" className="h-[52px] rounded-[14px] text-lg font-bold underline underline-offset-4" onClick={() => window.confirm("Leave this round? You will not get a group this round.") && post("/api/withdraw")}>
                Leave this round
              </Button>
            )}
          </div>
        </section>
      ) : view && !view.joined && view.roundStatus !== "open" && !as ? (
        <p className="bg-tint rounded-2xl p-4 text-lg">Round {view.round} has started. You can join in the next round.</p>
      ) : null}

      {!joined && (
        <form onSubmit={submit} className="flex flex-col gap-7">
          <Field id="code" label="Event code (on the screen)">
            <Input id="code" inputMode="numeric" autoComplete="off" className={`h-[72px] rounded-2xl border-2 bg-white px-5 text-4xl font-bold tracking-[12px] md:text-4xl ${form.code ? "border-primary" : ""}`} value={form.code} onChange={set("code")} required maxLength={4} />
          </Field>
          <Field id="name" label="Your full name">
            <Input id="name" autoComplete="name" className={fieldClass} value={form.name} onChange={set("name")} required maxLength={140} />
          </Field>
          <Field id="talk" label="What you'd like to talk about tonight">
            <Input id="talk" className={fieldClass} value={form.talk} onChange={set("talk")} required maxLength={140} />
            <span className="text-muted-foreground self-end text-base">{form.talk.length} / 140</span>
          </Field>
          <div className="flex flex-col gap-3.5">
            <p className="text-lg font-bold">Optional profile links, shown to people in your groups:</p>
            <Field id="linkedin" label="LinkedIn" small>
              <Input id="linkedin" inputMode="url" autoComplete="off" placeholder="linkedin.com/in/..." className={fieldClass} value={form.linkedin} onChange={set("linkedin")} maxLength={140} />
            </Field>
            <Field id="github" label="GitHub username or address" small>
              <Input id="github" inputMode="url" autoComplete="off" placeholder="octocat or github.com/..." className={fieldClass} value={form.github} onChange={set("github")} maxLength={140} />
            </Field>
            <Field id="website" label="Personal site" small>
              <Input id="website" inputMode="url" autoComplete="url" placeholder="example.com" className={fieldClass} value={form.website} onChange={set("website")} maxLength={140} />
            </Field>
          </div>
          <Field id="email" label="Email (optional)">
            <Input id="email" type="email" inputMode="email" autoComplete="email" className={fieldClass} value={form.email} onChange={set("email")} maxLength={120} />
            <span className="text-muted-foreground text-base leading-snug">Add your email if you want contact details from people you both want to meet again</span>
          </Field>
          <div className="border-border -mx-5 flex flex-col gap-3 border-t px-5 pt-4">
            <button type="button" onClick={() => {
              notice.current?.showModal();
              notice.current?.scrollTo(0, 0);
            }} className="text-primary flex min-h-12 items-center gap-2.5 self-start text-lg font-bold underline underline-offset-4">
              <svg className="flex-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              How we use what you enter
            </button>
            <dialog ref={notice} aria-labelledby="notice-title" className="bg-background text-foreground m-auto w-[calc(100%-2.5rem)] max-w-md rounded-[28px] p-0 backdrop:bg-[rgb(20_26_26/0.5)]" onClick={(e) => e.target === e.currentTarget && notice.current?.close()}>
              <div className="flex flex-col gap-5 p-6">
                <h2 id="notice-title" className="font-heading text-brand-ink text-[28px] leading-tight">How we use what you enter</h2>
                <ul className="flex list-disc flex-col gap-3 pl-5 text-[17px] leading-snug">
                  {noticeItems(nameSearch).map((line) => <li key={line}>{line}</li>)}
                </ul>
                <Button type="button" className="h-[58px] rounded-2xl text-xl font-bold" onClick={() => notice.current?.close()}>Close</Button>
              </div>
            </dialog>
            <p className="text-[17px] leading-snug">{consentLine(nameSearch)}</p>
            {error && <ErrorBanner text={error} />}
            <Button type="submit" className="h-[58px] rounded-2xl text-xl font-bold disabled:bg-[#cfc9bf] disabled:text-[#3b3832] disabled:opacity-100" disabled={busy}>
              {busy ? "Joining..." : editing ? "Save" : "Join"}
            </Button>
          </div>
        </form>
      )}

      {error && joined && <ErrorBanner text={error} />}
    </main>
  );
}

const REASON: Record<string, string> = {
  busy: "the reading service was busy",
  "not-a-profile": "not a profile link",
  failed: "the page could not be read",
  empty: "the page had no text",
  rejected: "this address was not accepted",
  "linkedin-off": "LinkedIn reading is off",
  cap: "too many reads tonight",
  timeout: "reading took too long",
};
const LINKS: [LinkKind, string][] = [["linkedin", "LinkedIn"], ["github", "GitHub"], ["website", "Personal site"]];
const PROFILE_WAIT_MS = 90_000;

function ProfileStep({ p, since, onContinue }: { p: Participant; since: number; onContinue: () => void }) {
  const read = p.profileRead;
  const reading = (!read || read.state === "reading") && Date.now() - since < PROFILE_WAIT_MS;
  const status = (k: LinkKind) => {
    if (reading) return { text: "Reading...", tone: "text-muted-foreground" };
    if (read?.state === "done" && read[k]) return { text: "Read", tone: "text-primary" };
    const why = read?.state === "done" ? read.reasons?.[k] : "timeout";
    return { text: `Could not read${why && REASON[why] ? `: ${REASON[why]}` : ""}`, tone: "text-destructive" };
  };
  return (
    <section className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-brand-ink text-[34px] leading-[1.1]">Your profile</h2>
        <p className="text-xl leading-snug">This is what we read from the addresses you gave, and what we keep to form groups.</p>
      </div>
      <ul className="flex flex-col gap-3">
        {LINKS.filter(([k]) => p[k]).map(([k, label]) => {
          const s = status(k);
          return (
            <li key={k} className="flex flex-col gap-1 rounded-2xl border-2 border-input bg-white px-4 py-3">
              <span className="text-[17px] font-bold">{label}</span>
              <span className="text-lg break-all">{p[k]}</span>
              <span className={`text-[17px] font-bold ${s.tone}`}>{s.text}</span>
            </li>
          );
        })}
      </ul>
      <div className="bg-tint flex flex-col gap-2 rounded-2xl p-4">
        <span className="text-[17px] font-bold">Summary we keep · Only you and the organiser see this</span>
        {reading ? (
          <p className="text-muted-foreground text-lg">Reading the pages, this takes up to a minute...</p>
        ) : p.profileSummary ? (
          <p className="text-lg leading-snug">{p.profileSummary}</p>
        ) : (
          <p className="text-lg leading-snug">No summary this time; grouping uses what you wrote.</p>
        )}
      </div>
      <Button className="mt-auto h-[58px] rounded-2xl text-xl font-bold" onClick={onContinue}>Continue</Button>
    </section>
  );
}

function MatchStep({ c, onAnswer }: { c: NameCandidate; onAnswer: (yes: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const answer = async (yes: boolean) => {
    setBusy(true);
    await onAnswer(yes);
    setBusy(false);
  };
  return (
    <section className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-brand-ink text-[34px] leading-[1.1]">Is this you?</h2>
        <p className="text-xl leading-snug">You gave no LinkedIn link, so we searched LinkedIn for your name. Only you see this.</p>
      </div>
      <div className="flex flex-col gap-1.5 rounded-2xl border-2 border-input bg-white px-4 py-3">
        {c.headline && <span className="text-lg font-bold leading-snug">{c.headline}</span>}
        {c.company && <span className="text-lg">{c.company}</span>}
        {c.location && <span className="text-muted-foreground text-lg">{c.location}</span>}
        <a className="text-primary text-[17px] break-all underline underline-offset-4" href={c.url} target="_blank" rel="noopener noreferrer">{c.url}</a>
      </div>
      <p className="text-[17px] leading-snug">Yes adds this as your LinkedIn link and reads the profile, like a link you paste. No forgets it.</p>
      <div className="mt-auto flex flex-col gap-3">
        <Button className="h-[58px] rounded-2xl text-xl font-bold" disabled={busy} onClick={() => answer(true)}>Yes, this is me</Button>
        <Button variant="secondary" className="h-14 rounded-2xl text-lg font-bold" disabled={busy} onClick={() => answer(false)}>No, not me</Button>
      </div>
    </section>
  );
}

function ErrorBanner({ text }: { text: string }) {
  return (
    <p role="alert" className="flex items-start gap-2.5 rounded-[14px] bg-[#f8e1dc] px-3.5 py-3 text-[17px] leading-snug font-bold text-[#7e1d13]">
      <svg className="mt-px flex-none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
      {text}
    </p>
  );
}

const CIRCLES = [
  { s: 72, c: "#0B5E5C", o: 0.9, f: [-70, -28], t: [-26, -10], d: 7 },
  { s: 56, c: "#3E8F8B", o: 0.8, f: [72, -36], t: [28, -12], d: 8 },
  { s: 64, c: "#7DB9B3", o: 0.85, f: [-56, 44], t: [-18, 16], d: 9 },
  { s: 48, c: "#B5D8D3", o: 0.95, f: [64, 46], t: [24, 18], d: 7.5 },
];

function Circles() {
  return (
    <div className="flex h-[200px] items-center justify-center" aria-hidden="true">
      <div className="relative h-[200px] w-[260px]">
        {CIRCLES.map((p, i) => (
          <div
            key={i}
            className="cu-motion absolute rounded-full"
            style={{
              left: 130 - p.s / 2,
              top: 100 - p.s / 2,
              width: p.s,
              height: p.s,
              background: p.c,
              opacity: p.o,
              transform: `translate(${p.f[0]}px,${p.f[1]}px)`,
              animation: `cu-drift ${p.d}s ease-in-out ${i * -1.3}s infinite`,
              ...({ "--fx": `${p.f[0]}px`, "--fy": `${p.f[1]}px`, "--tx": `${p.t[0]}px`, "--ty": `${p.t[1]}px` } as React.CSSProperties),
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Field({ id, label, small, children }: { id: string; label: string; small?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className={small ? "text-[17px] font-bold" : "text-lg font-bold"}>{label}</Label>
      {children}
    </div>
  );
}
