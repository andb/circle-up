import "server-only";
import { getEvent } from "./round";

type Props = Record<string, number | number[]>;

const RETRIES = 5;

function config() {
  const key = (process.env.POSTHOG_KEY ?? "").trim();
  const host = (process.env.POSTHOG_HOST ?? "").trim().replace(/\/+$/, "");
  return key && host ? { key, host } : null;
}

function ok(status: number) {
  return status >= 200 && status < 300;
}

// At most RETRIES retries per capture, on 429, 5xx and timeouts only, shared with the EU fallback host.
async function send(host: string, payload: string): Promise<number> {
  const eu = /(^|\/\/)eu\.posthog\.com$/.test(host);
  let status = 0;
  for (let attempt = 0; ; attempt++) {
    const target = eu && attempt > 0 && status !== 0 && status !== 429 && status < 500 ? "https://eu.i.posthog.com" : host;
    let retryable = true;
    try {
      const res = await fetch(`${target}/i/v0/e/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      if (ok(status)) return status;
      retryable = status === 429 || status >= 500;
    } catch {
      status = 0;
    }
    const tryEu = eu && target === host && !retryable;
    if ((!retryable && !tryEu) || attempt >= RETRIES) return status;
    console.error(`[retry] posthog ${status ? `status ${status}` : "timeout or network error"}, retry ${attempt + 1}`);
    if (retryable) await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** attempt, 4000)));
  }
}

async function emit(event: string, properties: Record<string, unknown>, detail = ""): Promise<void> {
  try {
    const c = config();
    if (!c) return;
    const historyId = getEvent().historyId;
    const payload = JSON.stringify({
      api_key: c.key,
      event,
      distinct_id: historyId,
      timestamp: new Date().toISOString(),
      properties: { ...properties, history_id: historyId, $process_person_profile: false, $geoip_disable: true },
    });
    const status = await send(c.host, payload);
    if (ok(status)) console.log(`posthog: ${event} sent, status ${status}${detail}`);
    else console.warn(`posthog: capture ${event} failed, status ${status}`);
  } catch {
    console.warn(`posthog: capture ${event} failed`);
  }
}

// Numbers only: no text, no alias, no participant or group id. The distinct id and history_id are the event's random history id.
export function capture(event: string, properties: Props): Promise<void> {
  return emit(event, properties);
}

export async function captureAll(event: string, list: Props[]): Promise<void> {
  await Promise.all(list.map((p) => capture(event, p)));
}

export type Generation = {
  traceId: string;
  traceName: "group-forming" | "rewrite" | "profile-summary" | "match-judge";
  model: string;
  latencyMs: number;
  httpStatus: number;
  inputTokens?: number;
  outputTokens?: number;
  attempts: number;
  rulesVersion: number;
  round?: number;
  isError: boolean;
};

// $ai_input and $ai_output_choices are never sent: they would hold participant text.
export function captureGeneration(g: Generation): Promise<void> {
  return emit(
    "$ai_generation",
    {
      $ai_trace_id: g.traceId,
      $ai_span_name: g.traceName,
      $ai_model: g.model,
      $ai_provider: "featherless",
      $ai_latency: g.latencyMs / 1000,
      $ai_http_status: g.httpStatus,
      $ai_is_error: g.isError,
      ...(g.inputTokens !== undefined ? { $ai_input_tokens: g.inputTokens } : {}),
      ...(g.outputTokens !== undefined ? { $ai_output_tokens: g.outputTokens } : {}),
      trace_name: g.traceName,
      attempts: g.attempts,
      rules_version: g.rulesVersion,
      ...(g.round !== undefined ? { round: g.round } : {}),
    },
    ` (${g.traceName}, ${g.inputTokens ?? "?"} in, ${g.outputTokens ?? "?"} out, ${g.latencyMs} ms)`,
  );
}
