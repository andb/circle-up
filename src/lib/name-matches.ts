import "server-only";
import { answerNameMatch, makeApifyNameSearch, nameSearchEnabled, runNameSearch, shouldSearch } from "./name-search";
import { startProfileRead } from "./profiles";
import { featherlessLive } from "./sponsor";
import { currentRound, currentRules, findParticipant, getEvent, type Participant } from "./round";

const SEARCH_MS = 120_000;

// Searches LinkedIn for the name of someone who gave no LinkedIn link, in the background. Logs counts only, never the name or any field.
export function startNameSearch(p: Participant) {
  if (!shouldSearch(p, nameSearchEnabled())) return;
  const started = Date.now();
  const trace = { traceId: `${getEvent().historyId}:name-match`, traceName: "match-judge" as const, rulesVersion: currentRules().version };
  runNameSearch(p, {
    search: makeApifyNameSearch({ token: process.env.APIFY_TOKEN ?? "", deadlineMs: 45_000 }),
    callModel: async ({ system, user, maxTokens }) => ({ text: await featherlessLive(user, { system, maxTokens, deadline: started + SEARCH_MS, label: "match", trace }) }),
    lookup: findParticipant,
    isOpen: () => currentRound().status === "open",
  })
    .then((r) => console.log(`name search: ${r.searched} candidates, ${r.asked ? "asked" : "no match"}, ${Date.now() - started} ms`))
    .catch(() => console.log("name search: failed"));
}

export function answerNameSearch(id: string, yes: boolean) {
  if (!nameSearchEnabled()) return { ok: false as const, error: "name search is off", status: 404 };
  const p = findParticipant(id);
  const res = answerNameMatch(p, yes, currentRound().status === "open");
  if (res.ok && res.linked && p) startProfileRead(p);
  return res;
}
