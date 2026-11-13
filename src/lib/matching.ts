import "server-only";
import { formGroups, rewriteRules, type CallModel, type FormResult, type Participant, type RulesVersion } from "./engine";
import { featherlessLive, type TraceMeta } from "./sponsor";
import { addVersion, aggregatesFor, currentRound, currentRules, getEvent, latestRatedRound } from "./round";
import { capture } from "./analytics";

const BUDGET_MS = 85_000;

// One trace per round: every model call for a round (forming, repairs, the rewrite its ratings feed) shares this id.
function traceFor(round: number, traceName: TraceMeta["traceName"], rulesVersion: number): TraceMeta {
  return { traceId: `${getEvent().historyId}-round-${round}`, traceName, rulesVersion, round };
}

function modelWithin(budgetMs: number, label: string, trace: TraceMeta): CallModel {
  const deadline = Date.now() + budgetMs;
  return ({ system, user, maxTokens }) => featherlessLive(user, { system, maxTokens: maxTokens ?? 2000, deadline, label, trace });
}

export async function runForming(people: Participant[], rules: RulesVersion): Promise<FormResult> {
  const started = Date.now();
  // Short ids keep the model's reply inside the engine's token budget; real ids never reach the model.
  const toReal = new Map(people.map((p, i) => [`p${i + 1}`, p.id]));
  const short = people.map((p, i) => ({ ...p, id: `p${i + 1}` }));
  const raw = await formGroups(short, rules, modelWithin(BUDGET_MS, `form ids=${people.length}`, traceFor(currentRound().number, "group-forming", rules.version)));
  const result = { ...raw, groups: raw.groups.map((g) => ({ ...g, memberIds: g.memberIds.map((id) => toReal.get(id) ?? id) })) };
  console.log(`form groups: ${result.formedBy}, ${result.groups.length} groups, ${Date.now() - started} ms`);
  return result;
}

export type RewriteOutcome = { ok: boolean; error?: string; from: number; to: number; simulated: boolean; at: string };

const g = globalThis as unknown as { __lastRewrite?: RewriteOutcome };

export function lastRewrite(): RewriteOutcome | null {
  return g.__lastRewrite ?? null;
}

let rewriting = false;
const improvedFrom = new Set<string>();

export async function improveRules(): Promise<RewriteOutcome> {
  const r = latestRatedRound();
  const current = currentRules();
  const at = new Date().toISOString();
  if (!r) return { ok: false, error: "no ratings from a model-formed round yet", from: current.version, to: current.version, simulated: false, at };
  const from = `${getEvent().historyId}:${r.number}`;
  if (improvedFrom.has(from)) return { ok: false, error: "rules already improved from this round", from: current.version, to: current.version, simulated: false, at };
  if (rewriting) return { ok: false, error: "already improving the rules", from: current.version, to: current.version, simulated: false, at };
  rewriting = true;
  try {
    const agg = aggregatesFor(r);
    const res = await rewriteRules(current, agg, modelWithin(BUDGET_MS, "rewrite", traceFor(r.number, "rewrite", current.version)));
    if (!res.ok) return { ok: false, error: res.error, from: current.version, to: current.version, simulated: agg.simulated, at };
    addVersion(res.version);
    improvedFrom.add(from);
    const ratingsUsed = agg.groups.filter((x) => x.formedBy !== "fallback").reduce((s, x) => s + x.raters, 0);
    void capture("rules_rewritten", {
      from_version: current.version,
      to_version: res.version.version,
      changes: res.version.changes.length,
      ratings_used: ratingsUsed,
      round: r.number,
      synthetic: r.synthetic ? 1 : 0,
      simulated: agg.simulated ? 1 : 0,
    });
    return (g.__lastRewrite = { ok: true, from: current.version, to: res.version.version, simulated: agg.simulated, at });
  } finally {
    rewriting = false;
  }
}
