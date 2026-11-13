import "server-only";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { captureGeneration, type Generation } from "./analytics";

// The only module that calls Apify or Featherless.

export type Service = "apify" | "featherless";
export type Method = "GET" | "POST";
export type Mode = "live" | "replay";

type Recorded = { call: string; request: unknown; response: unknown };

const RETRIES = 5;
const CHAT_URL = "https://api.featherless.ai/v1/chat/completions";
const CHAT_MODEL = "Qwen/Qwen3.5-397B-A17B";
// Qwen 3.5 reasons before answering unless told not to, which eats the token budget.
const NO_THINKING = { chat_template_kwargs: { enable_thinking: false } };
const RAG_ACTOR = "https://api.apify.com/v2/acts/apify~rag-web-browser";

export function mode(): Mode {
  return process.env.SPONSOR_MODE === "replay" ? "replay" : "live";
}

function keyFor(service: Service): string {
  const name = service === "apify" ? "APIFY_TOKEN" : "FEATHERLESS_API_KEY";
  let value = (process.env[name] ?? "").trim();
  const file = process.env[`${name}_FILE`];
  if (!value && file) {
    try {
      value = readFileSync(file, "utf8").trim();
    } catch {}
  }
  if (!value) throw new Error(`no key: set ${name}`);
  return value;
}

function recordingPath(): string {
  return process.env.SPONSOR_REPLAY_FILE || path.join(process.cwd(), "replay", "sponsor-calls.json");
}

async function loadRecording(): Promise<Recorded[]> {
  try {
    const data: unknown = JSON.parse(await readFile(/*turbopackIgnore: true*/ recordingPath(), "utf8"));
    return Array.isArray(data) ? (data as Recorded[]) : [];
  } catch {
    return [];
  }
}

let writeWarned = false;

async function appendRecording(entry: Recorded): Promise<void> {
  const file = recordingPath();
  try {
    const all = await loadRecording();
    all.push(entry);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(all, null, 2)}\n`);
  } catch (err) {
    if (writeWarned) return;
    writeWarned = true;
    console.warn(`sponsor: recording not written: ${(err as Error).message}`);
  }
}

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (Array.isArray(b)) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = Object.keys(ra);
  return keys.length === Object.keys(rb).length && keys.every((k) => k in rb && same(ra[k], rb[k]));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (status: number) => status === 0 || status === 429 || status >= 500;

type Attempted = { res: Response | null; status: number; attempts: number };

// Up to RETRIES retries on 429, 5xx and timeouts or network errors; any other status returns at once. Never logs bodies or keys.
async function fetchRetrying(label: string, url: string, init: RequestInit, opts: { timeoutMs?: number; deadline?: number } = {}): Promise<Attempted> {
  let status = 0;
  for (let attempt = 0; ; attempt++) {
    const left = opts.deadline ? opts.deadline - Date.now() : Infinity;
    if (left < 2000) return { res: null, status, attempts: attempt };
    const timeout = Math.min(opts.timeoutMs ?? Infinity, left);
    status = 0;
    try {
      const res = await fetch(url, { ...init, cache: "no-store", signal: Number.isFinite(timeout) ? AbortSignal.timeout(timeout) : undefined });
      status = res.status;
      if (!retryable(status) || attempt >= RETRIES) return { res, status, attempts: attempt + 1 };
      await res.body?.cancel();
    } catch {}
    if (attempt >= RETRIES) return { res: null, status, attempts: attempt + 1 };
    const wait = Math.min(1000 * 2 ** attempt, 8000);
    console.error(`[retry] ${label} ${status ? `status ${status}` : "timeout or network error"}, retry ${attempt + 1} in ${wait} ms`);
    await sleep(wait);
  }
}

export async function sponsorCall<T = unknown>(call: string, service: Service, url: string, method: Method, request: unknown): Promise<T> {
  if (mode() === "replay") {
    const mine = (await loadRecording()).filter((e) => e.call === call);
    const hit = mine.findLast((e) => same(e.request, request)) ?? mine.at(-1);
    if (!hit) throw new Error(`nothing recorded for ${call}`);
    return hit.response as T;
  }
  const { res, status } = await fetchRetrying(call, url, {
    method,
    headers: { Authorization: `Bearer ${keyFor(service)}`, "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(request) : undefined,
  });
  if (!res) throw new Error(`${service} ${status || "timeout"}: no reply after ${RETRIES} retries`);
  const text = await res.text();
  if (!res.ok) throw new Error(`${service} ${res.status}: ${text.slice(0, 300)}`);
  const response = JSON.parse(text) as T;
  await appendRecording({ call, request, response });
  return response;
}

export async function apifySearch(query: string): Promise<unknown[]> {
  return sponsorCall<unknown[]>("apify-search", "apify", `${RAG_ACTOR}/run-sync-get-dataset-items?timeout=120`, "POST", { query, maxResults: 3 });
}

type ChatReply = { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };

export async function featherlessChat(prompt: string): Promise<string> {
  const reply = await sponsorCall<ChatReply>("featherless-chat", "featherless", CHAT_URL, "POST", {
    model: CHAT_MODEL,
    ...NO_THINKING,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });
  return reply.choices?.[0]?.message?.content ?? "";
}

export async function apifyStart(query: string): Promise<string> {
  const reply = await sponsorCall<{ data: { id: string } }>("apify-start", "apify", `${RAG_ACTOR}/runs`, "POST", { query, maxResults: 3 });
  return reply.data.id;
}

export async function apifyRun(id: string): Promise<{ status: string; datasetId: string }> {
  const url = `https://api.apify.com/v2/actor-runs/${encodeURIComponent(id)}?waitForFinish=20`;
  const reply = await sponsorCall<{ data: { status: string; defaultDatasetId: string } }>("apify-run", "apify", url, "GET", { id });
  return { status: reply.data.status, datasetId: reply.data.defaultDatasetId };
}

export async function apifyItems(datasetId: string): Promise<unknown[]> {
  const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true`;
  return sponsorCall<unknown[]>("apify-items", "apify", url, "GET", { datasetId });
}

export type TraceMeta = { traceId: string; traceName: Generation["traceName"]; rulesVersion: number; round?: number };
export type LiveOpts = { system?: string; maxTokens?: number; deadline?: number; label?: string; trace?: TraceMeta };

const LIVE_CALL_TIMEOUT = 60_000;

function onGeneration(trace: TraceMeta | undefined, g: Pick<Generation, "latencyMs" | "httpStatus" | "attempts" | "isError" | "inputTokens" | "outputTokens">): void {
  if (trace) void captureGeneration({ ...g, ...trace, model: CHAT_MODEL });
}

// "featherless-live": always fetches, never records or replays, even in replay mode. Errors carry a status only, never prompt or reply text.
export async function featherlessLive(user: string, opts: LiveOpts = {}): Promise<string> {
  const started = Date.now();
  const messages = opts.system ? [{ role: "system", content: opts.system }, { role: "user", content: user }] : [{ role: "user", content: user }];
  const { res, status, attempts } = await fetchRetrying(
    "featherless-live",
    CHAT_URL,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${keyFor("featherless")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: CHAT_MODEL, ...NO_THINKING, max_tokens: opts.maxTokens ?? 2000, messages }),
    },
    { timeoutMs: LIVE_CALL_TIMEOUT, deadline: opts.deadline ?? started + LIVE_CALL_TIMEOUT },
  );
  const reply = res?.ok ? ((await res.json().catch(() => null)) as ChatReply | null) : null;
  const latencyMs = Date.now() - started;
  onGeneration(opts.trace, { latencyMs, httpStatus: status, attempts, isError: !reply, inputTokens: reply?.usage?.prompt_tokens, outputTokens: reply?.usage?.completion_tokens });
  if (!reply) {
    if (res?.ok) throw new Error("featherless: reply was not JSON");
    if (res) throw new Error(retryable(status) ? `featherless: failed after ${RETRIES} retries, status ${status}` : `featherless: status ${status}`);
    throw new Error(attempts > RETRIES ? `featherless: failed after ${RETRIES} retries` : "featherless: out of time");
  }
  console.log(`featherless-live ${opts.label ?? ""} ${latencyMs} ms`);
  return reply.choices?.[0]?.message?.content ?? "";
}
