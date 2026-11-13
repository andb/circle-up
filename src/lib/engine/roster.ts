import type { Participant } from "./types";

const ROWS: [string, string, string?][] = [
  ["Kestrel", "LLM evaluation for agents", "ML engineer building eval harnesses for agent products"],
  ["Juniper", "agent memory that lasts", "Backend developer tuning vector search"],
  ["Otter", "product analytics on a budget", "Growth lead who lives in PostHog funnels"],
  ["Marlin", "voice interfaces for older users"],
  ["Wren", "frontend design systems", "UX designer running design systems in React"],
  ["Basil", "shipping Next.js deploys fast", "Indie hacker deploying on Railway"],
  ["Quill", "developer tools people love"],
  ["Sable", "data pipelines from the web", "Data engineer scraping with Apify"],
  ["Tamarin", "data cleaning at scale", "Analyst using pandas and dbt"],
  ["Heron", "climate data from satellites", "Researcher in remote sensing and climate data"],
  ["Lumen", "agent prompts that hold up", "Prompt engineer evaluating LLM agents"],
  ["Pike", "fundraising for first-time founders", "Founder who raised a seed round"],
  ["Rook", "security for AI agents"],
  ["Indigo", "edtech with LLM tutors", "Teacher turned product manager"],
  ["Cove", "hardware hacking with sensors", "Maker building voice-controlled sensors"],
];

export function syntheticRoster(): Participant[] {
  return ROWS.map(([alias, topic, profileSummary], i) => ({ id: `p${i + 1}`, alias, topic, offer: "", need: "", preference: "peers", ...(profileSummary ? { profileSummary } : {}) }));
}
