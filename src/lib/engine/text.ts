import type { Participant } from "./types";

const STOPWORDS = new Set(["the", "and", "for", "with", "from", "into", "about", "how", "what", "who", "our", "your", "their", "that", "this", "using", "use", "of", "to", "in", "on", "a", "an", "at", "by", "or", "is", "it", "my", "we", "you", "are", "be", "can", "more", "who", "has", "have", "people", "building", "working", "work"]);

export function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9+#]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function sameWord(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return a === b;
  return a.slice(0, 5) === b.slice(0, 5);
}

export function interestText(p: Participant): string {
  return `${p.topic} ${p.profileSummary ?? ""}`;
}

export function sharesInterest(a: Participant, b: Participant): number {
  const bw = tokens(interestText(b));
  return new Set(tokens(interestText(a)).filter((t) => bw.some((w) => sameWord(t, w)))).size;
}

export function sharedInterestRate(members: Participant[]): number {
  let pairs = 0;
  let sharing = 0;
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    pairs++;
    if (sharesInterest(members[i], members[j]) > 0) sharing++;
  }
  return pairs ? Math.round((sharing / pairs) * 100) / 100 : 0;
}
