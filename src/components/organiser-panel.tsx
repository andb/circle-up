"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Spot = { name: string; description: string };
type Read = { status: string; reason: string | null } | null;
type Person = { id: string; name: string; talk: string; linkedin: string; github: string; website: string; reads: { linkedin: Read; github: Read; website: Read }; profileSummary: string; status: string; group: number | null; joinedAt: string | null };
type State = {
  people: Person[];
  code: string;
  round: number;
  roundStatus: string;
  synthetic: boolean;
  spots: Spot[];
  count: number;
  names: string[];
  withdrawn: number;
  openAs: { id: string; name: string; key: string }[];
  forming: boolean;
  formedBy: "model" | "repaired" | "fallback" | null;
  notes: string[];
  rulesVersion: number | null;
  groups: { number: number; spot: string; themes: string[]; themesTidied: boolean; members: string[]; raters: number; worthTally: number[]; worthAverage: number | null; peerAgainRate: number | null }[];
  ratings: number;
  simulated: boolean;
  rateable: boolean;
  rules: Version;
  versions: Version[];
  profileReads: Record<string, number>;
  records: { historyId: string; round: number; rulesVersion: number; synthetic: boolean; formedBy: string; simulated: boolean; ratings: number; worthAverage: number | null }[];
};
type Version = { version: number; rules: string[]; createdAt: string; changes: { change: string; reason: string; contrastId: string; feature: string; direction: string }[]; evidenceNote: string; fromSimulatedRatings: boolean };

const FEATURE: Record<string, string> = { sharedInterest: "shared interests", profileSummaries: "profile summaries", groupSize: "group size", talkAgain: "talk again" };
const FORMED: Record<string, string> = { model: "formed by the model", repaired: "formed by the model, repaired by code", fallback: "Model unreachable, groups formed by the simple split. Ratings from this round will not count as evidence." };

export function OrganiserPanel() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [qr, setQr] = useState("");
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const [rewriteNotice, setRewriteNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/organiser/state", { cache: "no-store" });
    if (res.status === 401) {
      window.location.reload();
      return;
    }
    const data: State = await res.json();
    setState(data);
    setSpots((s) => s ?? data.spots);
  }, []);

  const eventCode = state?.code;
  useEffect(() => {
    if (eventCode) setJoinUrl(`${window.location.origin}/join?code=${eventCode}`);
  }, [eventCode]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 320 }).then(setQr, () => setQr(""));
  }, [joinUrl]);

  async function backup(reason: string) {
    try {
      const res = await fetch("/api/organiser/download", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const round = data.rounds?.at(-1)?.number ?? "x";
      const time = new Date().toTimeString().slice(0, 8).replaceAll(":", "");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `circle-up-backup-round-${round}-${time}-${reason}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setLastBackup(`${new Date().toLocaleTimeString()} (${reason})`);
    } catch {
      setError("automatic backup failed; press Download history (JSON)");
    }
  }

  async function restore(file: File) {
    setError(null);
    const res = await fetch("/api/organiser/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
    const data = await res.json().catch(() => ({ error: "not a backup file" }));
    if (!res.ok) setError(data.error);
    else setRestored(`Restored ${data.versions} rules versions and ${data.rounds} rounds of numbers.`);
    refresh();
  }

  async function act(action: string, extra: object = {}, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    if (action === "end-round" || action === "end-event") await backup(`before-${action}`);
    setError(null);
    setBusy(action);
    try {
      const res = await fetch("/api/organiser/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({ error: `failed (${res.status})` }))).error;
        if (action === "rewrite") setRewriteNotice(`Rules not changed: ${msg}`);
        else setError(msg);
      } else if (action === "rewrite") setRewriteNotice(null);
      if (res.ok && (action === "publish" || action === "rewrite" || action === "simulate")) await backup(action === "simulate" ? "ratings" : action);
    } finally {
      setBusy(null);
    }
    if (action === "end-event") setSpots(null);
    refresh();
  }

  async function seed() {
    setError(null);
    const res = await fetch("/api/seed", { method: "POST" });
    if (!res.ok) setError((await res.json()).error);
    refresh();
  }

  if (!state) return <main className="p-6">Loading...</main>;

  const step = "h-auto min-h-16 flex-col items-start justify-center gap-0.5 rounded-2xl px-3.5 py-2.5 text-left text-lg font-bold whitespace-normal";
  const tool = "h-12 rounded-xl px-5 text-base font-bold";
  const panel = "rounded-3xl bg-card p-6 shadow-sm ring-0";
  const hint = "rounded-2xl bg-muted p-5 text-xl";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-10 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-heading text-2xl text-primary">Circle Up <span className="font-sans text-xl text-foreground">organiser</span></p>
        <div className="flex gap-2">
          <Badge>{state.roundStatus}</Badge>
          {state.synthetic && <Badge variant="secondary">synthetic roster</Badge>}
        </div>
      </header>

      <div className="grid items-stretch gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex items-center gap-14 rounded-3xl bg-primary px-8 py-7 text-primary-foreground">
          <div className="flex flex-col gap-1">
            <span className="text-xl">Round</span>
            <span className="font-heading text-7xl leading-none">{state.round}</span>
          </div>
          <div className="w-0.5 self-stretch bg-primary-foreground/30" />
          <div className="flex flex-col gap-1">
            <span className="text-xl">Event code</span>
            <span className="font-heading text-8xl leading-none tracking-widest">{state.code}</span>
          </div>
        </div>
        <div className="flex items-center gap-5 rounded-3xl bg-card p-5 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR code for the join address" className="size-48 rounded-xl" />}
          <div className="flex w-64 flex-col gap-2">
            <Label htmlFor="join-url" className="text-base font-bold">Address phones reach (not localhost)</Label>
            <Input id="join-url" className="h-12 rounded-xl border-2 text-lg" value={joinUrl} onChange={(e) => setJoinUrl(e.target.value)} />
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Round controls</h2>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <Button className={step} onClick={() => act("lock")} disabled={!!busy || state.roundStatus !== "open"}>Lock round</Button>
          <Button className={step} variant="secondary" onClick={() => act("form")} disabled={!!busy || state.forming || state.roundStatus === "published" || state.roundStatus === "ended"}>
            {state.groups.length ? "Form groups again (fresh model call)" : "Form groups"}
          </Button>
          <Button className={step} variant="secondary" onClick={() => act("publish")} disabled={!!busy || !state.groups.length || state.roundStatus !== "locked"}>Publish</Button>
          {state.synthetic && (
            <Button className={step} variant="secondary" onClick={() => act("simulate")} disabled={!!busy || state.roundStatus !== "published"}>Simulate ratings</Button>
          )}
          <Button className={step} onClick={() => act("rewrite")} disabled={!!busy || !state.rateable}>Improve the rules</Button>
          <Button className={step} variant="outline" onClick={() => act("end-round", {}, "End this round and open the next? Only people who ticked 'stay' come along.")}>
            End round and start the next
          </Button>
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t pt-6">
          <Button className={tool} variant="outline" onClick={seed}>Seed synthetic roster</Button>
          <a href="/api/organiser/download" download className={buttonVariants({ variant: "outline", className: tool })}>
            Download history (JSON)
          </a>
          <Button className={tool} variant="outline" onClick={() => backup("manual")} disabled={!!busy}>Back up now</Button>
          <label className={buttonVariants({ variant: "outline", className: tool })}>
            Restore history (JSON)
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
          </label>
          <Button className={tool} variant="destructive" onClick={() => act("end-event", {}, "End the event and delete everyone's text? This cannot be undone.")}>
            End event and delete everything
          </Button>
        </div>
      </section>

      {(lastBackup || restored) && (
        <p className="text-muted-foreground text-lg">
          {lastBackup && `Last backup saved to this browser's downloads at ${lastBackup}. `}
          {restored}
        </p>
      )}
      {(busy === "form" || state.forming) && (
        <p className="flex items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-primary/40 bg-muted p-10 text-2xl font-bold text-primary"><Spinner /> Forming groups with the model, this can take 30 seconds.</p>
      )}
      {busy === "rewrite" && (
        <p className="flex items-center gap-4 rounded-2xl bg-muted p-5 text-xl font-bold text-primary"><Spinner /> Improving the rules with the model, this can take 30 seconds.</p>
      )}
      {error && <p className="rounded-2xl bg-destructive/10 px-5 py-4 text-xl font-bold text-destructive">{error}</p>}

      <div className="grid gap-8 md:grid-cols-2">
        <Card className={panel}>
          <CardHeader className="px-0">
            <CardTitle className="flex items-baseline justify-between">
              <span className="flex items-baseline gap-2.5">
                <span className="font-heading text-5xl leading-none text-primary">{state.count}</span>
                <span className="text-2xl font-bold">joined</span>
                {state.withdrawn > 0 && <span className="text-muted-foreground text-lg font-normal">({state.withdrawn} left)</span>}
              </span>
              <span className="flex items-center gap-2 text-lg font-bold text-primary"><span className="size-2.5 rounded-full bg-primary" />Live</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 text-xl">
            {state.openAs.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {state.openAs.map((p) => (
                  <li key={p.id} className="border-b py-2">
                    {p.name}{" "}
                    <a className="text-primary underline" target="_blank" rel="noreferrer" href={`/join?as=${p.id}&key=${p.key}`}>
                      open as this participant
                    </a>
                  </li>
                ))}
              </ul>
            ) : state.names.length ? (
              <p>{state.names.join(", ")}</p>
            ) : (
              <p className={hint}>Nobody yet.</p>
            )}
          </CardContent>
        </Card>

        {spots && (
          <Card className={panel}>
            <CardHeader className="px-0">
              <CardTitle className="text-2xl font-bold">Spots</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 px-0">
              {spots.map((s, i) => (
                <div key={i} className="grid gap-2.5 sm:grid-cols-[12rem_1fr]">
                  <Input className="h-13 rounded-xl border-2 text-lg font-bold" aria-label={`Spot ${i + 1} name`} value={s.name} maxLength={140}
                    onChange={(e) => setSpots(spots.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input className="h-13 rounded-xl border-2 text-lg" aria-label={`Spot ${i + 1} description`} value={s.description} maxLength={140}
                    onChange={(e) => setSpots(spots.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                </div>
              ))}
              <div className="flex gap-3">
                <Button className={tool} variant="secondary" disabled={spots.length >= 20} onClick={() => setSpots([...spots, { name: "", description: "" }])}>Add a spot</Button>
                <Button className={tool} variant="secondary" disabled={spots.length <= 1} onClick={() => setSpots(spots.slice(0, -1))}>Remove last spot</Button>
                <Button className={tool} variant="secondary" onClick={() => act("spots", { spots })}>Save spots</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-3xl font-bold">Groups by meeting spot</h2>
          <span className="text-xl font-bold">{state.rulesVersion !== null && `Rules version ${state.rulesVersion}`}</span>
        </div>
        {state.formedBy && (
          <p className={`text-lg font-bold ${state.formedBy === "fallback" ? "text-destructive" : "text-muted-foreground"}`}>
            {state.formedBy === "fallback" && state.notes.some((n) => n.startsWith("fewer than three")) ? "Fewer than three people: one group, no model call." : FORMED[state.formedBy]}
          </p>
        )}
        {state.ratings > 0 && (
          <p className="text-muted-foreground text-lg">
            {state.ratings} ratings{state.simulated && " (SIMULATED)"}
          </p>
        )}
        {state.groups.some((g) => g.raters > 0) && (() => {
          const t = [0, 0, 0];
          let raters = 0, againSum = 0, againN = 0;
          for (const g of state.groups) {
            g.worthTally.forEach((n, i) => (t[i] += n));
            raters += g.raters;
            if (g.peerAgainRate !== null) { againSum += g.peerAgainRate * g.raters; againN += g.raters; }
          }
          return (
            <p className="rounded-2xl bg-muted px-4 py-3 text-lg font-bold">
              {state.simulated && "Simulated: "}Feedback this round: {raters} rated. Worth it: yes {t[2]}, somewhat {t[1]}, no {t[0]}.{againN > 0 && ` Would talk again: ${Math.round((againSum / againN) * 100)}% yes.`}
            </p>
          );
        })()}
        {state.groups.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {state.groups.map((g) => (
              <div key={g.number} className="flex flex-col gap-3.5 rounded-3xl bg-card p-6 shadow-sm">
                <p className="font-heading text-2xl text-primary">Group {g.number} at {g.spot}</p>
                <p className="text-lg">
                  {g.themes.join(" · ")}
                  {g.themesTidied && <span className="text-muted-foreground"> (themes tidied by code)</span>}
                </p>
                <p className="text-xl">{g.members.join(", ")}</p>
                {g.raters > 0 && (
                  <p className="border-t-2 pt-3 text-lg">
                    {state.simulated && "Simulated: "}{g.raters} rated. Worth it: yes {g.worthTally[2]}, somewhat {g.worthTally[1]}, no {g.worthTally[0]}.{g.peerAgainRate !== null && ` Would talk again: ${Math.round(g.peerAgainRate * 100)}% yes.`}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={hint}>Groups appear here after Form groups.</p>
        )}
      </section>

      <Card className={`${panel} p-7`}>
        <CardHeader className="px-0">
          <CardTitle className="text-3xl font-bold">Rules version {state.rules.version}{state.rules.fromSimulatedRatings && " (from simulated ratings)"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 px-0">
          <div className="grid gap-5 md:grid-cols-2">
            {state.versions.length > 1 && (
              <div className="rounded-2xl bg-background p-5">
                <p className="font-heading text-2xl text-primary">Previous: version {state.versions[state.versions.length - 2].version}</p>
                <ol className="list-decimal pl-5 text-lg">{state.versions[state.versions.length - 2].rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
              </div>
            )}
            <div className="rounded-2xl bg-background p-5">
              <p className="font-heading text-2xl text-primary">Current: version {state.rules.version}</p>
              <ol className="list-decimal pl-5 text-lg">{state.rules.rules.map((r, i) => <li key={i}>{r}</li>)}</ol>
            </div>
          </div>
          {rewriteNotice && <p className="text-destructive text-lg font-bold">{rewriteNotice}</p>}
          {state.rules.changes.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <p className="text-xl font-bold">What changed and why</p>
              <ul className="flex flex-col gap-2.5 text-xl">
                {state.rules.changes.map((c, i) => (
                  <li key={i} className="rounded-2xl bg-muted px-4 py-3">
                    {c.change}. Why: {c.reason}{" "}
                    <span className="text-muted-foreground">(contrast {c.contrastId}: {c.direction} {FEATURE[c.feature] ?? c.feature})</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground text-lg">{state.rules.evidenceNote}</p>
            </div>
          )}
          <div>
            <p className="text-xl font-bold">History</p>
            <ul className="text-lg">
              {state.versions.map((v) => (
                <li key={v.version} className="border-b py-1.5">
                  Version {v.version}{v.fromSimulatedRatings && " (from simulated ratings)"}:{" "}
                  {state.records.filter((r) => r.rulesVersion === v.version).map((r) =>
                    `round ${r.round}${r.synthetic ? " synthetic" : ""}${r.formedBy === "fallback" ? " deterministic split" : ""}, worth ${r.worthAverage ?? "not rated"}${r.simulated ? " simulated" : ""}`,
                  ).join("; ") || "no rounds yet"}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <details>
        <summary className="cursor-pointer text-2xl font-bold">People (not for the projector) ({state.people.length})</summary>
        <Card className={`${panel} mt-4 p-4`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-base">
              <thead>
                <tr className="border-b text-muted-foreground">
                  {["Name", "Talk", "Links", "Profile", "Status", "Group", "Joined"].map((h) => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {state.people.map((p) => (
                  <tr key={p.id} className="border-b align-top">
                    <td className="px-3 py-2 font-bold">{p.name}</td>
                    <td className="px-3 py-2">{p.talk}</td>
                    <td className="px-3 py-2">
                      {(["linkedin", "github", "website"] as const).map((k) => p[k] && (
                        <a key={k} href={p[k]} target="_blank" rel="noopener noreferrer" className="text-primary block underline">{k === "website" ? "Site" : k === "github" ? "GitHub" : "LinkedIn"}</a>
                      ))}
                      {!p.linkedin && !p.github && !p.website && <span className="text-muted-foreground">none</span>}
                    </td>
                    <td className="px-3 py-2">
                      {(["linkedin", "github", "website"] as const).map((k) => p.reads[k] && (
                        <p key={k} className={p.reads[k]!.status === "could not read" ? "text-destructive" : ""}>
                          {k === "website" ? "Site" : k === "github" ? "GitHub" : "LinkedIn"}: {p.reads[k]!.status}{p.reads[k]!.reason && ` (${p.reads[k]!.reason})`}
                        </p>
                      ))}
                      {p.profileSummary ? <p className="text-muted-foreground mt-1">{p.profileSummary}</p> : <p className="text-muted-foreground mt-1">No summary</p>}
                    </td>
                    <td className="px-3 py-2">{p.status}</td>
                    <td className="px-3 py-2">{p.group ?? "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{p.joinedAt ? new Date(p.joinedAt).toLocaleTimeString() : "-"}</td>
                  </tr>
                ))}
                {state.people.length === 0 && <tr><td colSpan={7} className="text-muted-foreground px-3 py-4">Nobody has joined yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </details>

      {Object.keys(state.profileReads).length > 0 && (
        <p className="text-muted-foreground text-base">
          Profile page reads: {["read", "busy", "cap", "not-a-profile", "failed", "empty", "rejected", "timeout"].filter((k) => state.profileReads[k]).map((k) => `${k} ${state.profileReads[k]}`).join(", ")}
        </p>
      )}
    </main>
  );
}
