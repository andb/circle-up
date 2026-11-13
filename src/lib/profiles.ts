import "server-only";
import { makeApifyFetchPage, readProfile } from "./profile";
import { featherlessLive } from "./sponsor";
import { countProfileReasons, currentRules, getEvent, markProfileReading, setProfile, type Participant } from "./round";

const OVERALL_MS = 180_000;
const MAX_TOTAL_MS = 300_000;

// Reads only the pages a person pasted, in the background. Logs counts only, never names, addresses or text.
export function startProfileRead(p: Participant) {
  const key = [p.linkedin, p.github, p.website].join("|");
  if (!p.linkedin && !p.github && !p.website) {
    if (p.profileRead) setProfile(p.id, p.profileRead.key, "", { linkedin: false, github: false, website: false });
    return;
  }
  if (p.profileRead?.key === key) return;
  markProfileReading(p.id, key);
  const started = Date.now();
  let queued = 0;
  let waitingSince = 0;
  const waited = () => queued + (waitingSince ? Date.now() - waitingSince : 0);
  const endsAt = () => Math.min(started + waited() + OVERALL_MS, started + MAX_TOTAL_MS);
  const trace = { traceId: `${getEvent().historyId}:profiles`, traceName: "profile-summary" as const, rulesVersion: currentRules().version };
  const read = readProfile(
    { name: p.name, urls: [p.github, p.linkedin].filter(Boolean), personalSite: p.website || undefined, allowLinkedIn: true },
    {
      fetchPage: makeApifyFetchPage({ token: process.env.APIFY_TOKEN ?? "", deadlineMs: OVERALL_MS - 10_000, onQueue: (waiting) => { if (waiting) waitingSince = Date.now(); else { queued += Date.now() - waitingSince; waitingSince = 0; } } }),
      callModel: ({ system, user }) => featherlessLive(user, { system, maxTokens: 300, deadline: endsAt(), label: "profile", trace }),
    },
  );
  // Time spent waiting for a LinkedIn slot does not count against the read: the timer re-arms by the wait recorded so far.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => {
    const arm = () => {
      const left = endsAt() - Date.now();
      if (left <= 0) r(null);
      else timer = setTimeout(arm, left);
    };
    arm();
  });
  Promise.race([read, timeout])
    .then((res) => {
      clearTimeout(timer);
      const ok = (url: string) => !!url && !!res?.sources.some((s) => s.ok && s.url.replace(/\/$/, "") === url.replace(/\/$/, ""));
      const reason = (url: string) => (!url ? undefined : res ? (res.sources.find((s) => s.url.replace(/\/$/, "") === url.replace(/\/$/, ""))?.reason ?? "failed") : "timeout");
      const flags = { linkedin: ok(p.linkedin), github: ok(p.github), website: ok(p.website) };
      setProfile(p.id, key, res?.profileSummary ?? "", { ...flags, reasons: { linkedin: reason(p.linkedin), github: reason(p.github), website: reason(p.website) } });
      countProfileReasons(res ? res.sources.map((x) => x.reason) : ["timeout"]);
      const n = Object.values(flags).filter(Boolean).length;
      console.log(`profile read: ${res ? res.sources.length : 0} sources, ${n} read, reasons ${res ? res.sources.map((x) => x.reason).join(",") : "timeout"}, summary ${res?.profileSummary ? "yes" : "no"}${res ? "" : " (timed out)"}, ${Date.now() - started} ms`);
    })
    .catch(() => {
      clearTimeout(timer);
      setProfile(p.id, key, "", { linkedin: false, github: false, website: false, reasons: { linkedin: p.linkedin ? "failed" : undefined, github: p.github ? "failed" : undefined, website: p.website ? "failed" : undefined } });
      countProfileReasons(["failed"]);
      console.log("profile read: failed");
    });
}
