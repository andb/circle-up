import { sharesInterest } from "./text";
import type { Group, Participant, Rating } from "./types";

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function affinity(a: Participant, b: Participant): number {
  return Math.min(1, sharesInterest(a, b) / 2);
}

export function simulateRatings(round: number, groups: Group[], participants: Participant[], seed = round): Rating[] {
  const rand = seeded(seed);
  const byId = new Map(participants.map((p) => [p.id, p]));
  return groups.flatMap((g) =>
    g.memberIds.map((raterId) => {
      const me = byId.get(raterId)!;
      const others = g.memberIds.filter((id) => id !== raterId);
      const peers = others.map((targetId) => ({ targetId, again: (affinity(me, byId.get(targetId)!) + rand() * 0.6 > 0.5 ? 1 : 0) as 0 | 1 }));
      const liked = peers.filter((p) => p.again).length / Math.max(1, peers.length);
      const worth = (liked > 0.6 ? 2 : liked > 0.25 ? 1 : 0) as 0 | 1 | 2;
      return { round, groupIndex: g.index, raterId, worth, peers, simulated: true };
    }),
  );
}
