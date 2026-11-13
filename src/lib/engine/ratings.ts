import { sharedInterestRate } from "./text";
import type { Group, GroupAggregate, Participant, Rating, RoundAggregates } from "./types";

export function acceptRatings(ratings: Rating[], groups: Group[]): Rating[] {
  const seen = new Set<string>();
  const out: Rating[] = [];
  for (const r of ratings) {
    const g = groups.find((x) => x.index === r.groupIndex);
    const key = `${r.round}:${r.raterId}`;
    if (!g || !g.memberIds.includes(r.raterId) || seen.has(key)) continue;
    if (![0, 1, 2].includes(r.worth)) continue;
    seen.add(key);
    const targets = new Set<string>();
    const peers = r.peers.filter((p) => p.targetId !== r.raterId && g.memberIds.includes(p.targetId) && (p.again === 0 || p.again === 1) && !targets.has(p.targetId) && targets.add(p.targetId));
    out.push({ ...r, peers });
  }
  return out;
}

export function aggregateRound(round: number, groups: Group[], participants: Participant[], ratings: Rating[], earlierVersions: RoundAggregates["earlierVersions"] = []): RoundAggregates {
  const valid = acceptRatings(ratings.filter((r) => r.round === round), groups);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const aggs: GroupAggregate[] = groups.map((g) => {
    const rs = valid.filter((r) => r.groupIndex === g.index);
    const members = g.memberIds.map((id) => byId.get(id)).filter((p): p is Participant => !!p);
    const tally: [number, number, number] = [0, 0, 0];
    for (const r of rs) tally[r.worth]++;
    const peerVotes = rs.flatMap((r) => r.peers.map((p) => p.again));
    const round2 = (x: number) => Math.round(x * 100) / 100;
    return {
      groupIndex: g.index,
      size: g.memberIds.length,
      sharedInterestRate: sharedInterestRate(members),
      withProfile: members.filter((m) => m.profileSummary?.trim()).length,
      formedBy: g.formedBy,
      raters: rs.length,
      worthTally: tally,
      worthAverage: rs.length ? round2((tally[1] + 2 * tally[2]) / rs.length) : null,
      peerRatings: peerVotes.length,
      peerAgainRate: peerVotes.length ? round2(peerVotes.reduce((s: number, v) => s + v, 0) / peerVotes.length) : null,
    };
  });
  return { round, rulesVersion: groups[0]?.rulesVersion ?? 0, simulated: valid.some((r) => r.simulated), groups: aggs, earlierVersions };
}

export function roundWorthAverage(agg: RoundAggregates): number | null {
  const rated = agg.groups.filter((g) => g.raters > 0 && g.formedBy !== "fallback");
  const n = rated.reduce((s, g) => s + g.raters, 0);
  if (!n) return null;
  return Math.round((rated.reduce((s, g) => s + g.worthTally[1] + 2 * g.worthTally[2], 0) / n) * 100) / 100;
}
