import "server-only";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import roster from "../../data/synthetic-roster.json";
import { linkedInProfileUrl } from "./profile";
import type { NameSearchState } from "./name-search";
import type { Direction, Feature, FormResult, FormedBy, Group, Participant as EngineParticipant, Rating, RulesVersion } from "./engine";
import { aggregateRound, initialRules, roundWorthAverage, simulateRatings, validateRules } from "./engine";

export type RoundStatus = "open" | "locked" | "published" | "ended";

export type Participant = {
  id: string;
  name: string;
  talk: string;
  linkedin: string;
  github: string;
  website: string;
  // Shown only to people this person and they both said they'd talk to again; never sent to a model, analytics, a log or the organiser.
  email: string;
  profileSummary?: string;
  profileRead?: { state: "reading" | "done"; linkedin: boolean; github: boolean; website: boolean; reasons?: Partial<Record<"linkedin" | "github" | "website", string>>; key: string };
  status: "in" | "withdrawn";
  arrived: boolean;
  stay: boolean;
  joinedAt?: string;
  nameSearch?: NameSearchState;
};

export type Round = {
  number: number;
  status: RoundStatus;
  synthetic: boolean;
  rulesVersion: number | null;
  participants: Participant[];
  groups: Group[] | null;
  formedBy: FormedBy | null;
  notes: string[];
  ratings: Rating[];
};

export type RoundRecord = {
  historyId: string;
  round: number;
  rulesVersion: number;
  synthetic: boolean;
  formedBy: FormedBy;
  simulated: boolean;
  ratings: number;
  worthAverage: number | null;
};

export type History = { versions: RulesVersion[]; rounds: RoundRecord[] };

export type Spot = { name: string; description: string };

export type Event = {
  code: string;
  historyId: string;
  asToken: string;
  createdAt: string;
  spots: Spot[];
  rounds: Round[];
};

export const FIELD_MAX = 140;

// EVENT_CODE (four digits) keeps the code people saw on screen across a restart.
function eventCode(): string {
  const fixed = (process.env.EVENT_CODE ?? "").trim();
  return /^\d{4}$/.test(fixed) ? fixed : String(randomInt(1000, 10000));
}

function newEvent(): Event {
  return {
    code: eventCode(),
    historyId: randomUUID(),
    asToken: randomBytes(16).toString("hex"),
    createdAt: new Date().toISOString(),
    spots: [
      { name: "Window", description: "The tables by the window" },
      { name: "Bar", description: "The high tables near the bar" },
      { name: "Sofas", description: "The sofas at the back" },
    ],
    rounds: [newRound(1, false, [])],
  };
}

function newRound(number: number, synthetic: boolean, participants: Participant[]): Round {
  return { number, status: "open", synthetic, rulesVersion: null, participants, groups: null, formedBy: null, notes: [], ratings: [] };
}

const g = globalThis as unknown as { __event?: Event; __history?: History };

export function getHistory(): History {
  g.__history ??= { versions: [initialRules()], rounds: [] };
  return g.__history;
}

export function currentRules(): RulesVersion {
  const v = getHistory().versions;
  return v[v.length - 1];
}

export function getEvent(): Event {
  g.__event ??= newEvent();
  return g.__event;
}

export function currentRound(): Round {
  const e = getEvent();
  return e.rounds[e.rounds.length - 1];
}

export type JoinInput = {
  code: string;
  id?: string;
  name: string;
  talk: string;
  linkedin?: string;
  github?: string;
  website?: string;
  email?: string;
};

export const EMAIL_MAX = 120;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, FIELD_MAX) : "";
}

function cleanUrl(v: unknown, host?: RegExp): string | null {
  const s = clean(v);
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (host && !host.test(u.hostname)) return null;
    if (!u.hostname.includes(".")) return null;
    return `https://${u.hostname}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return null;
  }
}

function findById(id: string): Participant | undefined {
  return currentRound().participants.find((p) => p.id === id);
}

export function findParticipant(id: string): Participant | undefined {
  return findById(id);
}

export function join(input: JoinInput, opts: { synthetic?: boolean } = {}): Result<Participant> {
  const e = getEvent();
  const r = currentRound();
  if (clean(input.code) !== e.code) return { ok: false, error: "check the code on the screen", status: 400 };
  const fields = { name: clean(input.name), talk: clean(input.talk) };
  if (!fields.name || !fields.talk) return { ok: false, error: "fill in your name and what you'd like to talk about", status: 400 };
  const linkedinRaw = cleanUrl(input.linkedin, /(^|\.)linkedin\.com$/i);
  const linkedin = linkedinRaw ? linkedInProfileUrl(new URL(linkedinRaw)) : linkedinRaw;
  if (linkedin === null) return { ok: false, error: "paste your profile link, the one with /in/", status: 400 };
  const githubName = clean(input.github);
  const github = /^@?[A-Za-z0-9-]{1,39}$/.test(githubName) ? `https://github.com/${githubName.replace(/^@/, "")}` : cleanUrl(input.github, /(^|\.)github\.com$/i);
  if (github === null) return { ok: false, error: "give your GitHub username or a github.com address", status: 400 };
  const website = cleanUrl(input.website);
  if (website === null) return { ok: false, error: "check your website address", status: 400 };
  const emailRaw = typeof input.email === "string" ? input.email.trim() : "";
  if (emailRaw.length > EMAIL_MAX || (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw))) return { ok: false, error: "check your email address", status: 400 };
  const links = { linkedin, github, website, email: emailRaw };

  if (!opts.synthetic) {
    if (r.synthetic) return { ok: false, error: "a demo round is running, join after it", status: 409 };
  } else if (hasReal()) {
    return { ok: false, error: "real people have joined; end the event first", status: 409 };
  }

  const existing = input.id ? findById(input.id) : undefined;
  if (r.status !== "open") {
    return existing
      ? { ok: false, error: "the round is locked; changes are closed", status: 409 }
      : { ok: false, error: "next round", status: 409 };
  }
  if (existing) {
    Object.assign(existing, fields, links, { status: "in", arrived: true });
    if (r.groups) r.groups = null;
    return { ok: true, value: existing };
  }
  const id = input.id && /^[0-9a-f-]{36}$/.test(input.id) ? input.id : randomUUID();
  const p: Participant = { id, ...fields, ...links, status: "in", arrived: true, stay: false, joinedAt: new Date().toISOString() };
  r.participants.push(p);
  if (opts.synthetic) r.synthetic = true;
  if (r.groups) r.groups = null;
  return { ok: true, value: p };
}

export function setProfile(id: string, key: string, summary: string, read: { linkedin: boolean; github: boolean; website: boolean; reasons?: Partial<Record<"linkedin" | "github" | "website", string>> }) {
  const p = findById(id);
  if (!p || p.profileRead?.key !== key) return;
  p.profileSummary = summary || undefined;
  p.profileRead = { state: "done", ...read, key };
}

const profileReasons: Record<string, number> = {};

export function countProfileReasons(reasons: string[]) {
  for (const r of reasons) profileReasons[r] = (profileReasons[r] ?? 0) + 1;
}

export function markProfileReading(id: string, key: string) {
  const p = findById(id);
  if (p) p.profileRead = { state: "reading", linkedin: false, github: false, website: false, key };
}

export function withdraw(id: string): Result<Participant> {
  const p = findById(id);
  if (!p) return { ok: false, error: "not in this round", status: 404 };
  p.status = "withdrawn";
  const r = currentRound();
  if (r.status === "open" && r.groups) r.groups = null;
  return { ok: true, value: p };
}

export function setStay(id: string, stay: boolean): Result<Participant> {
  const p = findById(id);
  if (!p) return { ok: false, error: "not in this round", status: 404 };
  p.stay = stay;
  return { ok: true, value: p };
}

export function participantView(id: string) {
  const r = currentRound();
  const p = findById(id);
  const mine = p ? evening(id).find((x) => x.round === r.number) : undefined;
  return {
    round: r.number,
    roundStatus: r.status,
    rulesVersion: r.rulesVersion,
    joined: !!p,
    participant: p ?? null,
    group: mine?.group ?? null,
  };
}

export function lockRound(): Result<Round> {
  const r = currentRound();
  if (r.status !== "open") return { ok: false, error: "the round is not open", status: 409 };
  r.status = "locked";
  return { ok: true, value: r };
}

export function endRound(): Result<Round> {
  const e = getEvent();
  const r = currentRound();
  r.status = "ended";
  const carried = r.participants
    .filter((p) => p.status === "in")
    .map((p) => ({ ...p, stay: false, arrived: true }));
  const next = newRound(r.number + 1, r.synthetic, carried);
  e.rounds.push(next);
  return { ok: true, value: next };
}

export function endEvent(): Event {
  getHistory().rounds.push(...recordsFor(getEvent()));
  g.__event = newEvent();
  return g.__event;
}

export function updateSpots(spots: unknown): Result<Spot[]> {
  if (!Array.isArray(spots) || spots.length < 1 || spots.length > 20) return { ok: false, error: "1 to 20 spots expected", status: 400 };
  const cleaned = spots.map((s) => ({ name: clean(s?.name), description: clean(s?.description) }));
  if (cleaned.some((s) => !s.name)) return { ok: false, error: "each spot needs a name", status: 400 };
  getEvent().spots = cleaned;
  return { ok: true, value: cleaned };
}

function hasReal(): boolean {
  return getEvent().rounds.some((r) => !r.synthetic && r.participants.length > 0);
}

export function seed(): Result<number> {
  const e = getEvent();
  const r = currentRound();
  if (hasReal()) return { ok: false, error: "real people have joined; end the event first", status: 409 };
  if (r.synthetic && r.participants.length > 0) return { ok: false, error: "the synthetic roster is already in", status: 409 };
  for (const person of roster as Omit<JoinInput, "code">[]) {
    const res = join({ ...person, code: e.code }, { synthetic: true });
    if (!res.ok) return res;
  }
  return { ok: true, value: r.participants.length };
}

export function checkAs(id: string, key: string): boolean {
  const e = getEvent();
  return currentRound().synthetic && key === e.asToken && !!findById(id);
}

export function organiserState() {
  const e = getEvent();
  const r = currentRound();
  const joined = r.participants.filter((p) => p.status === "in");
  return {
    code: e.code,
    round: r.number,
    roundStatus: r.status,
    synthetic: r.synthetic,
    spots: e.spots,
    count: joined.length,
    names: joined.map((p) => p.name),
    withdrawn: r.participants.length - joined.length,
    openAs: r.synthetic ? joined.map((p) => ({ id: p.id, name: p.name, key: e.asToken })) : [],
    people: peopleRows(r),
    forming,
    formedBy: r.formedBy,
    notes: r.notes,
    rulesVersion: r.rulesVersion,
    groups: groupSummaries(e, r),
    ratings: r.ratings.length,
    simulated: r.ratings.some((x) => x.simulated),
    rateable: !!latestRatedRound(),
    rules: currentRules(),
    versions: getHistory().versions,
    records: allRecords(),
    profileReads: { ...profileReasons },
  };
}

function peopleRows(r: Round) {
  const readStatus = (url: string, pr: Participant["profileRead"], k: "linkedin" | "github" | "website") =>
    !url ? null : !pr || pr.state === "reading" ? { status: "reading", reason: null } : pr[k] ? { status: "read", reason: null } : { status: "could not read", reason: pr.reasons?.[k] ?? null };
  return r.participants.map((p) => ({
    id: p.id,
    name: p.name,
    talk: p.talk,
    linkedin: p.linkedin,
    github: p.github,
    website: p.website,
    reads: { linkedin: readStatus(p.linkedin, p.profileRead, "linkedin"), github: readStatus(p.github, p.profileRead, "github"), website: readStatus(p.website, p.profileRead, "website") },
    profileSummary: p.profileSummary ?? "",
    status: p.status === "withdrawn" ? "left" : p.stay ? "stay" : "in",
    group: (r.groups?.find((g) => g.memberIds.includes(p.id))?.index ?? -1) + 1 || null,
    joinedAt: p.joinedAt ?? null,
  }));
}

function groupSummaries(e: Event, r: Round) {
  if (!r.groups) return [];
  const agg = aggregateRound(r.number, r.groups, engineParticipants(r), r.ratings);
  return r.groups.map((gr) => {
    const a = agg.groups.find((x) => x.groupIndex === gr.index);
    return {
      number: gr.index + 1,
      spot: e.spots[gr.index % e.spots.length].name,
      themes: gr.themes,
      themesTidied: !!gr.themesTidied,
      members: gr.memberIds.map((id) => {
        const p = r.participants.find((x) => x.id === id);
        return p ? (p.status === "withdrawn" ? `${p.name} (left)` : p.name) : "?";
      }),
      raters: a?.raters ?? 0,
      worthTally: a?.worthTally ?? [0, 0, 0],
      worthAverage: a?.worthAverage ?? null,
      peerAgainRate: a?.peerAgainRate ?? null,
    };
  });
}

// History only: numbers and rules. No participant, name, talk line, link, profile summary or theme (themes quote what people wrote).
export function exportHistory() {
  const e = getEvent();
  return {
    kind: "circle-up-history",
    exportedAt: new Date().toISOString(),
    eventCode: e.code,
    historyId: e.historyId,
    history: { versions: getHistory().versions, rounds: allRecords() },
    rounds: e.rounds.map((r) => {
      const agg = r.groups ? aggregateRound(r.number, r.groups, engineParticipants(r), r.ratings) : null;
      return {
        number: r.number,
        status: r.status,
        synthetic: r.synthetic,
        rulesVersion: r.rulesVersion,
        formedBy: r.formedBy,
        joined: r.participants.length,
        groups: (agg?.groups ?? []).map((a) => ({ group: a.groupIndex + 1, size: a.size, raters: a.raters, worthTally: a.worthTally, worthAverage: a.worthAverage, peerAgainRate: a.peerAgainRate, sharedInterestRate: a.sharedInterestRate, withProfile: a.withProfile })),
      };
    }),
  };
}

const windows = new Map<string, { start: number; count: number }>();

export function allow(key: string, max: number): boolean {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.start >= 60_000) {
    windows.set(key, { start: now, count: 1 });
    return true;
  }
  w.count += 1;
  return w.count <= max;
}

export function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

function engineParticipants(r: Round) {
  return r.participants
    .filter((p) => p.status === "in")
    // Names and profile addresses never reach the model: the engine sees an id, the talk line and an optional profile summary.
    // The engine reads only id, topic and profileSummary; its type still lists older fields it no longer uses.
    .map((p) => ({ id: p.id, topic: p.talk, ...(p.profileSummary ? { profileSummary: p.profileSummary } : {}) }) as EngineParticipant);
}

let forming = false;

export function isForming(): boolean {
  return forming;
}

export async function formCurrentRound(run: (people: ReturnType<typeof engineParticipants>, rules: RulesVersion) => Promise<FormResult>): Promise<Result<Round>> {
  const r = currentRound();
  if (forming) return { ok: false, error: "already forming groups", status: 409 };
  if (r.status === "published" || r.status === "ended") return { ok: false, error: "this round is already published", status: 409 };
  const people = engineParticipants(r);
  if (people.length === 0) return { ok: false, error: "nobody has joined this round", status: 409 };
  r.status = "locked";
  const rules = currentRules();
  forming = true;
  try {
    const result = await run(people, rules);
    if (currentRound() !== r || r.status !== "locked") return { ok: false, error: "the round changed while forming", status: 409 };
    r.groups = result.groups;
    r.formedBy = result.formedBy;
    r.notes = result.notes;
    r.rulesVersion = rules.version;
    return { ok: true, value: r };
  } finally {
    forming = false;
  }
}

export function publishRound(): Result<Round> {
  const r = currentRound();
  if (!r.groups) return { ok: false, error: "form groups first", status: 409 };
  if (r.status !== "locked") return { ok: false, error: "the round is not ready to publish", status: 409 };
  r.status = "published";
  return { ok: true, value: r };
}

function findRound(n: number): Round | undefined {
  return getEvent().rounds.find((r) => r.number === n);
}

export function rate(id: string, roundNumber: number, worth: unknown, peers: unknown): Result<Rating> {
  const r = findRound(roundNumber);
  if (!r || !r.groups || (r.status !== "published" && r.status !== "ended")) return { ok: false, error: "this round cannot be rated", status: 409 };
  const group = r.groups.find((gr) => gr.memberIds.includes(id));
  if (!group) return { ok: false, error: "you were not in a group this round", status: 404 };
  if (worth !== 0 && worth !== 1 && worth !== 2) return { ok: false, error: "choose how worthwhile it was", status: 400 };
  const list = Array.isArray(peers) ? peers : [];
  const cleaned = list
    .map((x) => ({ targetId: Number.isInteger(x?.ref) ? group.memberIds[x.ref] : undefined, again: x?.again }))
    .filter((x): x is { targetId: string; again: 0 | 1 } => !!x.targetId && x.targetId !== id && (x.again === 0 || x.again === 1));
  const rating: Rating = { round: r.number, groupIndex: group.index, raterId: id, worth, peers: cleaned, simulated: false };
  r.ratings = r.ratings.filter((x) => x.raterId !== id).concat(rating);
  return { ok: true, value: rating };
}

export function simulateCurrent(): Result<Rating[]> {
  const r = currentRound();
  if (!r.synthetic) return { ok: false, error: "simulated ratings are for synthetic rounds only", status: 409 };
  if (!r.groups || r.status !== "published") return { ok: false, error: "publish the groups first", status: 409 };
  r.ratings = simulateRatings(r.number, r.groups, engineParticipants(r), r.number * 7919 + r.participants.length);
  return { ok: true, value: r.ratings };
}

function recordsFor(e: Event): RoundRecord[] {
  return e.rounds
    .filter((r) => r.groups && r.formedBy && r.rulesVersion)
    .map((r) => {
      const agg = aggregateRound(r.number, r.groups!, engineParticipants(r), r.ratings);
      return {
        historyId: e.historyId,
        round: r.number,
        rulesVersion: r.rulesVersion!,
        synthetic: r.synthetic,
        formedBy: r.formedBy!,
        simulated: r.ratings.some((x) => x.simulated),
        ratings: r.ratings.length,
        worthAverage: roundWorthAverage(agg),
      };
    });
}

export function allRecords(): RoundRecord[] {
  const live = recordsFor(getEvent());
  const key = (x: RoundRecord) => `${x.historyId}:${x.round}`;
  const liveKeys = new Set(live.map(key));
  return [...getHistory().rounds.filter((x) => !liveKeys.has(key(x))), ...live];
}

export function latestRatedRound(): Round | undefined {
  return [...getEvent().rounds].reverse().find((r) => r.groups && r.formedBy !== "fallback" && r.ratings.length > 0);
}

export function aggregatesFor(r: Round) {
  const others = allRecords().filter((x) => !(x.historyId === getEvent().historyId && x.round === r.number) && x.formedBy !== "fallback");
  const byVersion = new Map<number, number[]>();
  for (const x of others) if (x.worthAverage !== null) byVersion.set(x.rulesVersion, [...(byVersion.get(x.rulesVersion) ?? []), x.worthAverage]);
  const earlierVersions = [...byVersion.entries()].map(([version, ws]) => ({ version, worthAverage: Math.round((ws.reduce((a, b) => a + b, 0) / ws.length) * 100) / 100 }));
  return aggregateRound(r.number, r.groups!, engineParticipants(r), r.ratings, earlierVersions);
}

export function addVersion(v: RulesVersion) {
  getHistory().versions.push(v);
}

function latestCopy(id: string): Participant | undefined {
  for (const r of [...getEvent().rounds].reverse()) {
    const p = r.participants.find((x) => x.id === id);
    if (p) return p;
  }
  return undefined;
}

// People who said they'd talk to `id` again and whom `id` said the same of, using each person's latest answer about the other.
// One-sided answers reveal nothing. Simulated ratings never count. No ids are returned: an id is a person's credential.
export function mutualAgain(id: string) {
  const latest = new Map<string, 0 | 1>();
  for (const r of getEvent().rounds)
    for (const rating of r.ratings) {
      if (rating.simulated) continue;
      for (const peer of rating.peers) latest.set(`${rating.raterId}>${peer.targetId}`, peer.again);
    }
  const out: { name: string; linkedin: string; email: string }[] = [];
  for (const [key, again] of latest) {
    const [from, to] = key.split(">");
    if (from !== id || to === id || again !== 1 || latest.get(`${to}>${id}`) !== 1) continue;
    const p = latestCopy(to);
    if (p) out.push({ name: p.name, linkedin: p.linkedin, email: p.email ?? "" });
  }
  return out;
}

export function evening(id: string) {
  const e = getEvent();
  return e.rounds
    .filter((r) => r.participants.some((p) => p.id === id))
    .map((r) => {
      const group = r.status === "published" || r.status === "ended" ? r.groups?.find((gr) => gr.memberIds.includes(id)) : undefined;
      const mine = r.ratings.find((x) => x.raterId === id);
      return {
        round: r.number,
        status: r.status,
        rulesVersion: r.rulesVersion,
        group: group
          ? {
              number: group.index + 1,
              spot: e.spots[group.index % e.spots.length],
              themes: group.themes,
              members: group.memberIds
                .map((mid, ref) => ({ ref, p: r.participants.find((x) => x.id === mid) }))
                .filter((m): m is { ref: number; p: Participant } => !!m.p)
                .map(({ ref, p }) => ({ ref, name: p.name, talk: p.talk, linkedin: p.linkedin, github: p.github, website: p.website, me: p.id === id, withdrawn: p.status === "withdrawn" })),
            }
          : null,
        myRating: mine && !mine.simulated && group ? { worth: mine.worth, peers: mine.peers.map((x) => ({ ref: group.memberIds.indexOf(x.targetId), again: x.again })) } : null,
      };
    });
}

type BackupRound = { number?: unknown; synthetic?: unknown; rulesVersion?: unknown; formedBy?: unknown; groups?: unknown; ratings?: unknown };

// Restores rules versions and per-round numbers from an event download; people and their text are never read back.
export function restoreHistory(backup: unknown): Result<{ versions: number; rounds: number }> {
  const b = backup as { event?: { historyId?: unknown; rounds?: BackupRound[] }; history?: { versions?: unknown; rounds?: unknown } };
  const versions = b?.history?.versions;
  if (!Array.isArray(versions) || versions.length === 0) return { ok: false, error: "this file holds no rules versions", status: 400 };
  const cleanVersions: RulesVersion[] = [];
  for (const v of versions) {
    const shapeOk =
      v && Number.isInteger(v.version) && v.version >= 1 && Array.isArray(v.rules) && validateRules(v.rules).length === 0 &&
      typeof v.createdAt === "string" && typeof v.evidenceNote === "string" && typeof v.fromSimulatedRatings === "boolean" &&
      Array.isArray(v.changes) && v.changes.every((c: Record<string, unknown>) => c && typeof c.change === "string" && typeof c.reason === "string");
    if (!shapeOk) return { ok: false, error: "a rules version in this file is not valid", status: 400 };
    cleanVersions.push({
      version: v.version,
      rules: v.rules.map(String),
      createdAt: String(v.createdAt ?? ""),
      changes: Array.isArray(v.changes)
        ? v.changes.map((c: Record<string, unknown>) => ({
            change: String(c?.change ?? ""),
            reason: String(c?.reason ?? ""),
            contrastId: String(c?.contrastId ?? ""),
            feature: (["sharedInterest", "profileSummaries", "groupSize", "talkAgain"].includes(String(c?.feature)) ? c.feature : "sharedInterest") as Feature,
            direction: (c?.direction === "weaken" ? "weaken" : "strengthen") as Direction,
          }))
        : [],
      evidenceNote: String(v.evidenceNote ?? ""),
      fromSimulatedRatings: !!v.fromSimulatedRatings,
    });
  }
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const records: RoundRecord[] = [];
  if (Array.isArray(b.history?.rounds)) {
    for (const x of b.history.rounds as Record<string, unknown>[]) {
      const round = num(x?.round), rulesVersion = num(x?.rulesVersion);
      if (round === null || rulesVersion === null) continue;
      records.push({ historyId: String(x.historyId ?? ""), round, rulesVersion, synthetic: !!x.synthetic, formedBy: (["model", "repaired", "fallback"].includes(String(x.formedBy)) ? x.formedBy : "fallback") as FormedBy, simulated: !!x.simulated, ratings: num(x.ratings) ?? 0, worthAverage: num(x.worthAverage) });
    }
  }
  const top = (backup as { historyId?: unknown })?.historyId;
  const historyId = typeof top === "string" ? top : typeof b.event?.historyId === "string" ? b.event.historyId : "";
  for (const r of b.event?.rounds ?? []) {
    const round = num(r?.number), rulesVersion = num(r?.rulesVersion);
    if (round === null || rulesVersion === null || !Array.isArray(r.groups) || !Array.isArray(r.ratings)) continue;
    const groups = (r.groups as Group[]).filter((x) => x && Array.isArray(x.memberIds));
    const ratings = (r.ratings as Rating[]).filter((x) => x && [0, 1, 2].includes(x.worth));
    const agg = aggregateRound(round, groups, [], ratings);
    records.push({ historyId, round, rulesVersion, synthetic: !!r.synthetic, formedBy: (["model", "repaired", "fallback"].includes(String(r.formedBy)) ? r.formedBy : "fallback") as FormedBy, simulated: ratings.some((x) => x.simulated), ratings: ratings.length, worthAverage: roundWorthAverage(agg) });
  }
  cleanVersions.sort((a, c) => a.version - c.version);
  if (cleanVersions.some((v, i) => v.version !== i + 1)) return { ok: false, error: "rules versions in this file are not numbered 1, 2, 3...", status: 400 };
  g.__history = { versions: cleanVersions, rounds: records };
  const e = getEvent();
  if (historyId) e.historyId = historyId;
  const fresh = e.rounds.length === 1 && e.rounds[0].participants.length === 0;
  const last = Math.max(0, ...records.filter((x) => x.historyId === e.historyId).map((x) => x.round));
  if (fresh && last > 0) e.rounds[0].number = last + 1;
  return { ok: true, value: { versions: cleanVersions.length, rounds: records.length } };
}
