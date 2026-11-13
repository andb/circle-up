import type { CallModel, ModelPrompt } from "./types";

type Scripted = string | Error;

export interface FakeModel {
  callModel: CallModel;
  prompts: ModelPrompt[];
}

function groupReply(user: string): string {
  const block = user.split("<<<PARTICIPANTS\n")[1]?.split("\nPARTICIPANTS>>>")[0] ?? "";
  const people = block.split("\n").filter(Boolean).map((l) => JSON.parse(l) as { id: string; talk: string; profile?: string });
  people.sort((a, b) => a.talk.localeCompare(b.talk));
  const k = Math.ceil(people.length / 5);
  const groups = Array.from({ length: k }, (_, i) => people.filter((_, j) => j % k === i));
  const assign = Object.fromEntries(groups.flatMap((g, i) => g.map((p) => [p.id, i + 1])));
  return "```json\n" + JSON.stringify({ assign, groups: groups.map((g, i) => ({ group: i + 1, themes: [g[0].talk, g[1].talk, g[2]?.talk ?? g[0].profile ?? g[1].talk] })) }) + "\n```";
}

function rewriteReply(user: string): string {
  const m = user.match(/^(C\d+) \[feature (\w+), supports (\w+)\]/m);
  return JSON.stringify({
    rules: [
      "Group people whose talk lines or profile summaries share an interest.",
      "Give each group shared themes that come from its members' talk lines and profile summaries.",
      "Mix backgrounds: avoid groups whose members all describe the same role or field.",
      "Prefer groups where most members share at least one interest word with each other.",
    ],
    changes: [{ change: "Added: prefer groups where most members share an interest word.", contrast: m?.[1] ?? "C1", feature: m?.[2], direction: m?.[3] }],
  });
}

export function createFakeModel(script: Scripted[] = []): FakeModel {
  const prompts: ModelPrompt[] = [];
  const queue = [...script];
  const callModel: CallModel = async (prompt) => {
    prompts.push(prompt);
    const next = queue.shift();
    if (next instanceof Error) throw next;
    if (typeof next === "string") return next;
    return prompt.user.includes("<<<PARTICIPANTS") ? groupReply(prompt.user) : rewriteReply(prompt.user);
  };
  return { callModel, prompts };
}
