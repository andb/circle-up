import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { pathToFileURL } from "node:url";
import { before, test } from "node:test";

// round.ts imports "server-only", which only Next resolves; outside Next it is Next's own empty module.
const STUB = pathToFileURL(nodeModule.createRequire(import.meta.url).resolve("next/dist/compiled/server-only/empty.js")).href;
type Resolve = (specifier: string, context: object, next: (specifier: string, context: object) => object) => object;
// registerHooks is in Node 24 but not in the @types/node 20 this project pins.
(nodeModule as unknown as { registerHooks: (hooks: { resolve: Resolve }) => void }).registerHooks({ resolve: (specifier, context, next) => (specifier === "server-only" ? { url: STUB, shortCircuit: true } : next(specifier, context)) });

const MARK = "sentinel-mail.test";
const emailOf = (who: string) => `${who}@${MARK}`;
const sent: string[] = [];
const logged: string[] = [];
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  sent.push(`${String(url)} ${typeof init?.body === "string" ? init.body : ""}`);
  return new Response("{}", { status: 403 });
}) as typeof fetch;
for (const k of ["log", "warn", "error", "info"] as const) console[k] = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
Object.assign(process.env, { POSTHOG_KEY: "test-not-a-key", POSTHOG_HOST: "https://posthog.invalid", APIFY_TOKEN: "test-not-a-key", FEATHERLESS_API_KEY: "test-not-a-key", NAME_SEARCH: "on", SPONSOR_MODE: "live" });

let round: typeof import("../src/lib/round");
let buildGroupingPrompt: typeof import("../src/lib/engine/grouping").buildGroupingPrompt;
let joinRoute: typeof import("../src/app/api/join/route");
let rateRoute: typeof import("../src/app/api/rate/route");
let eveningRoute: typeof import("../src/app/api/evening/route");
let meRoute: typeof import("../src/app/api/me/route");
before(async () => {
  round = await import("../src/lib/round");
  ({ buildGroupingPrompt } = await import("../src/lib/engine/grouping"));
  joinRoute = await import("../src/app/api/join/route");
  rateRoute = await import("../src/app/api/rate/route");
  eveningRoute = await import("../src/app/api/evening/route");
  meRoute = await import("../src/app/api/me/route");
});

const post = (handler: (r: Request) => Promise<Response>, body: object) =>
  handler(new Request("http://x/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const joinAs = async (name: string, extra: object = {}) => {
  const res = await post(joinRoute.POST, { code: round.getEvent().code, name, talk: `${name} talks about evals`, email: emailOf(name.split(" ")[0].toLowerCase()), ...extra });
  assert.equal(res.status, 200, await res.clone().text());
  return (await res.json()).id as string;
};
const eveningFor = async (id: string) => (await eveningRoute.GET(new Request(`http://x/api/evening?id=${id}`))).json();
const settle = () => new Promise((r) => setTimeout(r, 300));

test("mutual yes reveals both ways, one-sided yes reveals nothing, email reaches no model, analytics, log or organiser view", async () => {
  const a = await joinAs("Ada", { linkedin: "linkedin.com/in/ada-test" });
  const b = await joinAs("Bo");
  const c = await joinAs("Cy Tester");
  await settle();

  let prompt = "";
  const formed = await round.formCurrentRound(async (people, rules) => {
    prompt = JSON.stringify([people, buildGroupingPrompt(people, rules)]);
    return { groups: [{ index: 0, memberIds: [a, b, c], themes: ["evals"], rulesVersion: rules.version, formedBy: "model", themesTidied: false }], formedBy: "model", notes: [] };
  });
  assert.ok(formed.ok);
  assert.ok(prompt.includes("Ada talks about evals"), "the prompt was captured");
  assert.ok(round.publishRound().ok);

  // refs are member indexes: a=0, b=1, c=2
  for (const [id, peers] of [[a, [{ ref: 1, again: 1 }, { ref: 2, again: 1 }]], [b, [{ ref: 0, again: 1 }, { ref: 2, again: 0 }]], [c, [{ ref: 0, again: 0 }, { ref: 1, again: 1 }]]] as const) {
    const res = await post(rateRoute.POST, { id, round: 1, worth: 2, peers });
    assert.equal(res.status, 200);
  }
  await settle();

  const ea = await eveningFor(a), eb = await eveningFor(b), ec = await eveningFor(c);
  assert.deepEqual(ea.mutual, [{ name: "Bo", linkedin: "", email: emailOf("bo") }]);
  assert.deepEqual(eb.mutual, [{ name: "Ada", linkedin: "https://linkedin.com/in/ada-test/", email: emailOf("ada") }]);
  assert.deepEqual(ec.mutual, [], "C said yes to B and A said yes to C, both one-sided");
  for (const [view, own] of [[ea, "ada"], [eb, "bo"], [ec, "cy"]] as const) {
    const others = JSON.stringify(view).replaceAll(emailOf(own), "");
    const leaked = others.match(new RegExp(`[\\w.]+@${MARK}`, "g")) ?? [];
    const allowed = view.mutual.map((m: { email: string }) => m.email);
    assert.deepEqual(leaked.filter((e) => !allowed.includes(e)), [], "no email beyond the mutual list");
    assert.ok(!JSON.stringify(view.mutual).includes('"id"'), "no ids in the mutual list");
  }

  const organiser = JSON.stringify(round.organiserState());
  const download = JSON.stringify(round.exportHistory());
  assert.ok(organiser.includes("Ada"), "organiser state is populated");
  for (const [where, text] of [["model prompt", prompt], ["outbound requests (every fetch, PostHog included)", sent.join("\n")], ["logs", logged.join("\n")], ["organiser state", organiser], ["organiser download", download]] as const)
    assert.ok(!text.includes(MARK), `email found in ${where}`);
  assert.ok(sent.some((s) => s.includes("posthog.invalid") && s.includes("group_rated")), "analytics payloads were captured and checked");

  // The latest answer wins: B changing to No ends the match for both.
  await post(rateRoute.POST, { id: b, round: 1, worth: 2, peers: [{ ref: 0, again: 0 }] });
  assert.deepEqual((await eveningFor(a)).mutual, []);
  assert.deepEqual((await eveningFor(b)).mutual, []);

  // Each person still reads back their own email for "Change my answers".
  assert.equal((await (await meRoute.GET(new Request(`http://x/api/me?id=${a}`))).json()).participant.email, emailOf("ada"));

  round.endEvent();
  assert.deepEqual(round.mutualAgain(a), []);
  assert.equal(round.findParticipant(a), undefined);
});

test("a Yes in one round and a Yes back in a later round match, and the list stays after someone leaves", async () => {
  round.endEvent();
  const a = await joinAs("Ada"), b = await joinAs("Bo"), c = await joinAs("Cy");
  const form = async () => {
    assert.ok((await round.formCurrentRound(async (_people, rules) => ({ groups: [{ index: 0, memberIds: [a, b, c], themes: ["evals"], rulesVersion: rules.version, formedBy: "model", themesTidied: false }], formedBy: "model", notes: [] }))).ok);
    assert.ok(round.publishRound().ok);
  };
  await form();
  const n1 = round.currentRound().number;
  assert.ok(round.rate(a, n1, 2, [{ ref: 1, again: 1 }]).ok);
  assert.ok(round.rate(b, n1, 2, [{ ref: 0, again: 0 }]).ok);
  assert.deepEqual(round.mutualAgain(a), []);
  round.endRound();
  await form();
  assert.ok(round.rate(b, round.currentRound().number, 2, [{ ref: 0, again: 1 }]).ok);
  assert.deepEqual((await eveningFor(a)).mutual.map((m: { name: string }) => m.name), ["Bo"]);
  assert.deepEqual((await eveningFor(b)).mutual.map((m: { name: string }) => m.name), ["Ada"]);
  assert.ok(round.withdraw(a).ok);
  round.endRound();
  assert.equal(round.findParticipant(a), undefined, "A is not in the new round");
  assert.deepEqual((await eveningFor(a)).mutual, [{ name: "Bo", linkedin: "", email: emailOf("bo") }]);
});

test("email validation: optional, must look like an email, at most 120 characters", () => {
  round.endEvent();
  const code = round.getEvent().code;
  const j = (email: string) => round.join({ code, name: "Val", talk: "testing", email });
  assert.equal(j("").ok, true);
  assert.equal(j("not-an-email").ok, false);
  assert.equal(j(`${"x".repeat(110)}@example.com`).ok, false);
  const ok = j("  val@example.com ");
  assert.ok(ok.ok && ok.value.email === "val@example.com");
});
