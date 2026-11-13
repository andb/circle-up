export type Preference = "help" | "peers" | "exploration";

export interface Participant {
  id: string;
  alias: string;
  topic: string;
  offer: string;
  need: string;
  preference: Preference;
  profileSummary?: string;
}

export interface RuleChange {
  change: string;
  reason: string;
  contrastId: string;
  feature: Feature;
  direction: Direction;
}

export type Feature = "sharedInterest" | "profileSummaries" | "groupSize" | "talkAgain";
export type Direction = "strengthen" | "weaken";

export interface Contrast {
  id: string;
  feature: Feature;
  supports: Direction;
  label: string;
  versusLabel: string;
  worth: number;
  versusWorth: number;
  groups: number;
  versusGroups: number;
  ratings: number;
}

export interface RulesVersion {
  version: number;
  rules: string[];
  createdAt: string;
  changes: RuleChange[];
  evidenceNote: string;
  fromSimulatedRatings: boolean;
}

export type FormedBy = "model" | "repaired" | "fallback";

export interface Group {
  index: number;
  memberIds: string[];
  themes: string[];
  rulesVersion: number;
  formedBy: FormedBy;
  themesTidied: boolean;
}

export interface FormResult {
  groups: Group[];
  formedBy: FormedBy;
  notes: string[];
}

export interface Rating {
  round: number;
  groupIndex: number;
  raterId: string;
  worth: 0 | 1 | 2;
  peers: { targetId: string; again: 0 | 1 }[];
  simulated: boolean;
}

export interface GroupAggregate {
  groupIndex: number;
  size: number;
  sharedInterestRate: number;
  withProfile: number;
  formedBy: FormedBy;
  raters: number;
  worthTally: [number, number, number];
  worthAverage: number | null;
  peerRatings: number;
  peerAgainRate: number | null;
}

export interface RoundAggregates {
  round: number;
  rulesVersion: number;
  simulated: boolean;
  groups: GroupAggregate[];
  earlierVersions: { version: number; worthAverage: number | null }[];
}

export interface ModelPrompt {
  system: string;
  user: string;
  maxTokens?: number;
}

export type CallModel = (prompt: ModelPrompt) => Promise<string>;

export type RewriteResult =
  | { ok: true; version: RulesVersion }
  | { ok: false; version: RulesVersion; error: string };
