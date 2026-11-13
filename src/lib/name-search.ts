import { apifyRunItems, isCapacityMessage, linkedInProfileUrl, redact, withCapacityRetries, withLinkedInBudget, type DailyCounter, type FetchOpts } from "./profile";
import { findMatch, initialJudgePrompt, type ModelCall, type SearchCandidates, type SearchResult } from "./match";

export const NAME_SEARCH_ACTOR = "harvestapi~linkedin-profile-search-by-name";
export const DEFAULT_NAME_SEARCH_DAILY_CAP = 60;
// Searches share the three LinkedIn slots with profile reads, so a busy Apify gets two tries, not five.
export const NAME_SEARCH_ATTEMPTS = 2;
// Words the judge may count as moderate evidence that a candidate comes to this kind of evening.
export const EVENT_TERMS = ["AI", "hackathon", "software", "startup"];

export function nameSearchEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NAME_SEARCH === "on";
}

export function splitName(name: string): { firstName: string; lastName: string } | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return { firstName: words[0], lastName: words.slice(1).join(" ") };
}

function text(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 200) : "";
}

// Short-mode items carry the headline as `position` and `location.linkedinText`; only headline, location, current company and the profile address are kept.
export function toSearchResults(items: unknown[], limit: number): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const urlRaw = text(it.linkedinUrl) || text(it.profileUrl) || text(it.url);
    let url: string | null = null;
    try { url = urlRaw ? linkedInProfileUrl(new URL(urlRaw)) : null; } catch { url = null; }
    if (!url || seen.has(url)) continue;
    seen.add(url);
    // Each candidate's own name, handle, links and emails are removed here, so the judge never sees a name even when it differs from the searched one.
    const own = [text(it.name), `${text(it.firstName)} ${text(it.lastName)}`, text(it.publicIdentifier), url.split("/").filter(Boolean).pop() ?? ""];
    const clean = (v: string) => redact(v, own).replace(/\[(person|link|email)\]/g, "").replace(/\s+([,.;:|])/g, "$1").replace(/\s+/g, " ").replace(/^[\s,.;:|-]+|[\s,.;:|-]+$/g, "");
    const loc = it.location as Record<string, unknown> | string | undefined;
    const location = clean(typeof loc === "string" ? text(loc) : loc && typeof loc === "object" ? text(loc.linkedinText) || text((loc.parsed as Record<string, unknown> | undefined)?.text) : "");
    const positions = (Array.isArray(it.currentPosition) ? it.currentPosition : Array.isArray(it.currentPositions) ? it.currentPositions : []) as Record<string, unknown>[];
    const currentCompany = clean(text(positions[0]?.companyName) || text(it.companyName));
    out.push({ headline: clean(text(it.headline) || text(it.position)), location: location || undefined, currentCompany: currentCompany || undefined, profileUrl: url });
    if (out.length >= limit) break;
  }
  return out;
}

export type NameSearchOpts = FetchOpts & { token: string; dailyCap?: number; counter?: DailyCounter; now?: () => Date; runTimeoutSecs?: number };

const searchCounter: DailyCounter = { day: "", used: 0, inFlight: 0 };

// One Short-mode search page (up to 10 people, one $0.004 charge) through the shared LinkedIn queue and its own daily counter.
export function makeApifyNameSearch(opts: NameSearchOpts): SearchCandidates {
  const runTimeout = opts.runTimeoutSecs ?? 60;
  const o = {
    fetchImpl: opts.fetchImpl ?? fetch,
    sleep: opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
    timeoutMs: (runTimeout + 15) * 1000,
    deadlineMs: opts.deadlineMs ?? 45_000,
  };
  return async (name, { limit }) => {
    const parts = splitName(name);
    if (!parts || !opts.token) return [];
    const input = { profileScraperMode: "Short", ...parts, strictSearch: true, maxPages: 1, maxItems: limit };
    const once = () =>
      withCapacityRetries(async () => {
        const run = await apifyRunItems(NAME_SEARCH_ACTOR, input, opts.token, o, runTimeout);
        if (run.items.length) return toSearchResults(run.items, limit);
        if (isCapacityMessage(run.message)) return { capacity: run.message };
        if (run.status !== "SUCCEEDED") throw new Error("run not succeeded");
        return [] as SearchResult[];
      }, o.sleep, NAME_SEARCH_ATTEMPTS);
    return withLinkedInBudget(once, () => true, { cap: opts.dailyCap ?? DEFAULT_NAME_SEARCH_DAILY_CAP, now: opts.now ?? (() => new Date()), counter: opts.counter ?? searchCounter });
  };
}

export type NameCandidate = { headline: string; company?: string; location?: string; url: string };
export type NameSearchState = { name: string; state: "searching" | "ask" | "done"; candidate?: NameCandidate };

export type Person = { id: string; name: string; talk: string; linkedin: string; status: "in" | "withdrawn"; nameSearch?: NameSearchState };

export type NameSearchDeps = {
  search: SearchCandidates;
  callModel: ModelCall;
  lookup: (id: string) => Person | undefined;
  isOpen: () => boolean;
};

export function shouldSearch(p: Person, enabled: boolean): boolean {
  return enabled && p.status === "in" && !p.linkedin && !!splitName(p.name) && p.nameSearch?.name !== p.name;
}

// Searches once per name. Nothing found, an unsure judge, or any failure ends silently with no candidate kept.
export async function runNameSearch(p: Person, deps: NameSearchDeps): Promise<{ searched: number; asked: boolean }> {
  const name = p.name;
  p.nameSearch = { name, state: "searching" };
  let candidate: SearchResult | null = null;
  let searched = 0;
  try {
    const r = await findMatch({ name, attendee: { talk: p.talk }, eventTerms: EVENT_TERMS, search: deps.search, callModel: deps.callModel, prompt: initialJudgePrompt() });
    candidate = r.candidate;
    searched = r.searched;
  } catch {
    candidate = null;
  }
  const now = deps.lookup(p.id);
  if (!now || now.nameSearch?.name !== name || now.nameSearch.state !== "searching") return { searched, asked: false };
  if (!candidate || now.linkedin || now.status !== "in" || now.name !== name || !deps.isOpen()) {
    now.nameSearch = { name, state: "done" };
    return { searched, asked: false };
  }
  now.nameSearch = { name, state: "ask", candidate: { headline: candidate.headline, company: candidate.currentCompany, location: candidate.location, url: candidate.profileUrl } };
  return { searched, asked: true };
}

export type AnswerResult = { ok: true; linked: boolean } | { ok: false; error: string; status: number };

// Yes makes the candidate's address the person's LinkedIn link; No drops the candidate. Either way only the searched name stays, so the same name is not searched again.
export function answerNameMatch(p: Person | undefined, yes: boolean, isOpen: boolean): AnswerResult {
  const s = p?.nameSearch;
  if (!p || !s || s.state !== "ask" || !s.candidate) return { ok: false, error: "nothing to confirm", status: 409 };
  const url = s.candidate.url;
  p.nameSearch = { name: s.name, state: "done" };
  if (!yes || !isOpen || p.linkedin) return { ok: true, linked: false };
  p.linkedin = url;
  return { ok: true, linked: true };
}
