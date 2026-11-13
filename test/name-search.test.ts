import assert from "node:assert/strict";
import { test } from "node:test";
import { answerNameMatch, makeApifyNameSearch, runNameSearch, shouldSearch, toSearchResults, type Person } from "../src/lib/name-search";
import { makeApifyFetchPage, type DailyCounter } from "../src/lib/profile";
import type { ModelRequest, SearchCandidates } from "../src/lib/match";
import { consentLine, noticeItems } from "../src/lib/notice";

const NAME = "Zebulon Quillfeather";
const person = (over: Partial<Person> = {}): Person => ({ id: "p1", name: NAME, talk: `I am ${NAME}, building LLM agent evals`, linkedin: "", status: "in", ...over });
const found = [
  { headline: "Chef at Bistro Nine", location: "Lyon", currentCompany: "Bistro Nine", profileUrl: "https://www.linkedin.com/in/zq-chef/" },
  { headline: `Zebulon Quillfeather | ML engineer, LLM agent evaluation`, location: "Prague, Quillfeather Labs", currentCompany: "Quillfeather Labs", profileUrl: "https://www.linkedin.com/in/zq-ml/" },
];
const fakeSearch = (results = found): SearchCandidates => async () => results;
const fakeModel = (replies: string[]) => {
  const requests: ModelRequest[] = [];
  return { requests, callModel: async (r: ModelRequest) => { requests.push(r); const t = replies.shift(); if (t === undefined) throw new Error("no reply"); return { text: t }; } };
};
const deps = (p: Person, search: SearchCandidates, callModel: ReturnType<typeof fakeModel>["callModel"], open = true) => ({ search, callModel, lookup: (id: string) => (id === p.id ? p : undefined), isOpen: () => open });

test("found and confirmed: the candidate is asked, Yes sets the LinkedIn link", async () => {
  const p = person();
  const model = fakeModel(['{"index": 1, "confidence": 0.9}']);
  const r = await runNameSearch(p, deps(p, fakeSearch(), model.callModel));
  assert.deepEqual(r, { searched: 2, asked: true });
  assert.equal(p.nameSearch?.state, "ask");
  assert.equal(p.nameSearch?.candidate?.url, "https://www.linkedin.com/in/zq-ml/");
  assert.deepEqual(answerNameMatch(p, true, true), { ok: true, linked: true });
  assert.equal(p.linkedin, "https://www.linkedin.com/in/zq-ml/");
  assert.deepEqual(p.nameSearch, { name: NAME, state: "done" });
  assert.equal(shouldSearch(p, true), false);
});

test("No stores nothing from the search", async () => {
  const p = person();
  await runNameSearch(p, deps(p, fakeSearch(), fakeModel(['{"index": 1, "confidence": 0.9}']).callModel));
  assert.deepEqual(answerNameMatch(p, false, true), { ok: true, linked: false });
  assert.equal(p.linkedin, "");
  assert.deepEqual(p.nameSearch, { name: NAME, state: "done" });
  const stored = JSON.stringify(p);
  for (const c of found) for (const v of [c.profileUrl, c.headline, c.currentCompany, c.location]) assert.ok(!stored.includes(v), v);
  assert.equal(shouldSearch(p, true), false, "a No is not searched again");
  assert.equal(answerNameMatch(p, true, true).ok, false, "a later Yes has nothing to confirm");
});

test("the judge's input contains no name, not even inside candidate fields or the talk line", async () => {
  const p = person();
  const model = fakeModel(['{"index": 1, "confidence": 0.9}']);
  await runNameSearch(p, deps(p, fakeSearch(), model.callModel));
  assert.equal(model.requests.length, 1);
  const sent = `${model.requests[0].system}\n${model.requests[0].user}`;
  for (const w of [NAME, "Zebulon", "Quillfeather"]) assert.ok(!sent.toLowerCase().includes(w.toLowerCase()), w);
  assert.ok(sent.includes("ML engineer, LLM agent evaluation"), "fields other than the name still reach the judge");
  assert.ok(!sent.includes("linkedin.com"), "no profile address reaches the judge");
});

test("flag off: notice and consent line do not mention name search, and no search starts", () => {
  const offText = [...noticeItems(false), consentLine(false)].join(" ");
  assert.ok(!/search|for your name|picks|confirm/i.test(offText), offText);
  assert.equal(consentLine(false), "Your talk line goes to an AI model and we read the links you give. Names and groups appear on the organiser's screen.");
  assert.equal(noticeItems(false).length, 6);
  assert.match(consentLine(true), /search LinkedIn for your name through Apify and an AI picks a match for you to confirm/);
  assert.ok(noticeItems(true).some((l) => /no LinkedIn link, we search LinkedIn for your name through Apify/.test(l)));
  assert.equal(shouldSearch(person(), false), false);
  assert.equal(shouldSearch(person(), true), true);
  assert.equal(shouldSearch(person({ linkedin: "https://www.linkedin.com/in/x/" }), true), false);
  assert.equal(shouldSearch(person({ name: "Zebulon" }), true), false, "one word is not a full name");
});

test("unsure judge, none, empty search and a failing search all end silently with nothing kept", async () => {
  for (const [search, replies] of [
    [fakeSearch(), ['{"index": 1, "confidence": 0.5}']],
    [fakeSearch(), ['{"index": "none", "confidence": 0.9}']],
    [fakeSearch([]), []],
    [(async () => { throw new Error("apify down"); }) as SearchCandidates, []],
    [fakeSearch(), ["garbage", "garbage"]],
  ] as [SearchCandidates, string[]][]) {
    const p = person();
    const r = await runNameSearch(p, deps(p, search, fakeModel(replies).callModel));
    assert.equal(r.asked, false);
    assert.deepEqual(p.nameSearch, { name: NAME, state: "done" });
    assert.equal(p.linkedin, "");
  }
});

test("a result is dropped if the person added a link, left, or the round locked while searching", async () => {
  for (const change of [(p: Person) => { p.linkedin = "https://www.linkedin.com/in/own/"; }, (p: Person) => { p.status = "withdrawn"; }, null]) {
    const p = person();
    const search: SearchCandidates = async () => { change?.(p); return found; };
    await runNameSearch(p, deps(p, search, fakeModel(['{"index": 1, "confidence": 0.9}']).callModel, change !== null));
    assert.equal(p.nameSearch?.state, "done");
    assert.equal(p.nameSearch?.candidate, undefined);
  }
  const p = person();
  const search: SearchCandidates = async () => { p.name = "Other Person"; p.nameSearch = { name: "Other Person", state: "searching" }; return found; };
  await runNameSearch(p, deps(p, search, fakeModel(['{"index": 1, "confidence": 0.9}']).callModel));
  assert.deepEqual(p.nameSearch, { name: "Other Person", state: "searching" }, "a stale search does not overwrite a newer one");
});

test("Yes after the round locked keeps nothing", async () => {
  const p = person();
  await runNameSearch(p, deps(p, fakeSearch(), fakeModel(['{"index": 1, "confidence": 0.9}']).callModel));
  assert.deepEqual(answerNameMatch(p, true, false), { ok: true, linked: false });
  assert.equal(p.linkedin, "");
});

// ---- Apify search over a fake fetch ----

type Call = { url: string; body?: unknown };
function fakeApify(runs: { status: string; statusMessage?: string; items: unknown[] }[]) {
  const calls: Call[] = [];
  let i = -1;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/runs?")) { i++; return Response.json({ data: { id: `run${i}`, status: runs[i].status, statusMessage: runs[i].statusMessage, defaultDatasetId: `ds${i}` } }); }
    if (url.includes("/datasets/")) return Response.json(runs[i].items);
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const counter = (): DailyCounter => ({ day: "", used: 0, inFlight: 0 });
const shortItem = { id: "x", name: "Ada Brightwater", position: "Chief Example Officer at Example Corp", photo: "https://example.invalid/p.jpg", location: { linkedinText: "Springfield, ST" }, linkedinUrl: "https://www.linkedin.com/in/abrightwater", publicIdentifier: "abrightwater" };
const item = { id: "x", firstName: "Ada", lastName: "Brightwater", headline: "Chief Example Officer at Example Corp", linkedinUrl: "https://www.linkedin.com/in/abrightwater", location: { linkedinText: "Springfield, State" }, currentPosition: [{ companyName: "Example Corp" }], email: "nobody@example.invalid" };

test("the Apify search sends Short mode with first and last name, one page, and keeps professional fields only", async () => {
  const f = fakeApify([{ status: "SUCCEEDED", items: [item, { ...item }, { headline: "no url" }] }]);
  const search = makeApifyNameSearch({ token: "t", fetchImpl: f.fetchImpl, sleep: async () => {}, counter: counter() });
  const out = await search("Ada Brightwater", { limit: 10 });
  assert.match(f.calls[0].url, /acts\/harvestapi~linkedin-profile-search-by-name\/runs\?/);
  assert.deepEqual(f.calls[0].body, { profileScraperMode: "Short", firstName: "Ada", lastName: "Brightwater", strictSearch: true, maxPages: 1, maxItems: 10 });
  assert.deepEqual(out, [{ headline: "Chief Example Officer at Example Corp", location: "Springfield, State", currentCompany: "Example Corp", profileUrl: "https://www.linkedin.com/in/abrightwater/" }]);
  assert.ok(!JSON.stringify(out).includes("@"), "no email");
});

test("capacity is tried at most twice for a search, and the daily cap stops searches", async () => {
  const busy = { status: "FAILED", statusMessage: "CAPACITY_UNAVAILABLE", items: [] };
  const f = fakeApify([busy, busy, busy, busy, busy, busy, busy]);
  const search = makeApifyNameSearch({ token: "t", fetchImpl: f.fetchImpl, sleep: async () => {}, counter: counter() });
  await assert.rejects(search("Ada Brightwater", { limit: 10 }), /capacity/);
  assert.equal(f.calls.filter((c) => c.url.includes("/runs?")).length, 2);
  const c = { day: "", used: 0, inFlight: 0 };
  const g = fakeApify([{ status: "SUCCEEDED", items: [item] }, { status: "SUCCEEDED", items: [item] }]);
  const capped = makeApifyNameSearch({ token: "t", fetchImpl: g.fetchImpl, sleep: async () => {}, counter: c, dailyCap: 1 });
  assert.equal((await capped("Ada Brightwater", { limit: 10 })).length, 1);
  await assert.rejects(capped("Ada Brightwater", { limit: 10 }), /cap/);
  assert.equal(await makeApifyNameSearch({ token: "t", fetchImpl: g.fetchImpl, counter: counter() })("Zephyrine", { limit: 10 }).then((r) => r.length), 0, "one-word names are not searched");
});

test("the profile reader still works after its Apify runner was shared", async () => {
  const f = fakeApify([{ status: "SUCCEEDED", items: [{ headline: "Builds things", about: "Agents" }] }]);
  const read = makeApifyFetchPage({ token: "t", fetchImpl: f.fetchImpl, sleep: async () => {} });
  assert.equal(await read("https://www.linkedin.com/in/someone"), "headline: Builds things\nabout: Agents");
  assert.match(f.calls[0].url, /harvestapi~linkedin-profile-scraper/);
});

test("toSearchResults reads the Short-mode shape seen live: headline in position, location.linkedinText, no name kept", () => {
  assert.deepEqual(toSearchResults([shortItem], 10), [{ headline: "Chief Example Officer at Example Corp", location: "Springfield, ST", currentCompany: undefined, profileUrl: "https://www.linkedin.com/in/abrightwater/" }]);
});

test("a candidate's own name, different from the searched one, never reaches the judge", async () => {
  const items = [{ name: "Quentin Marvelbrook", position: "Quentin Marvelbrook | LLM agent evals at Marvelbrook AI, quentin@marvelbrook.example", location: { linkedinText: "Prague" }, linkedinUrl: "https://www.linkedin.com/in/qmarvelbrook", publicIdentifier: "qmarvelbrook" }];
  const results = toSearchResults(items, 10);
  assert.equal(results[0].headline, "LLM agent evals at AI");
  const p = person();
  const model = fakeModel(['{"index": 0, "confidence": 0.9}']);
  await runNameSearch(p, deps(p, async () => results, model.callModel));
  const sent = `${model.requests[0].system}\n${model.requests[0].user}`;
  for (const w of ["Quentin", "Marvelbrook", "qmarvelbrook", "@"]) assert.ok(!sent.toLowerCase().includes(w.toLowerCase()), w);
});

test("toSearchResults drops items without a profile address and caps the count", () => {
  const many = Array.from({ length: 15 }, (_, i) => ({ headline: `h${i}`, linkedinUrl: `https://www.linkedin.com/in/p${i}` }));
  assert.equal(toSearchResults(many, 10).length, 10);
  assert.equal(toSearchResults([{ headline: "x", linkedinUrl: "https://www.linkedin.com/company/acme" }], 10).length, 0);
});
