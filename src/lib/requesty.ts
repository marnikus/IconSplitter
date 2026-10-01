// requesty.ts — Requesty gateway contract (design §1): OpenAI-compatible
// multimodal chat completions, provider usage with actual cost, and an error
// taxonomy where only rate limits retry themselves; unknown states never
// blind-retry (D2). Pure shapes; the network lives in src/svggen (next step).

import { redact } from "./secrets";

export const DEFAULT_BASE_URL = "https://router.requesty.ai/v1";
export const DEFAULT_MODEL = "openai/gpt-6.1-sol";

export interface RequestyConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  retries: number;
  concurrency: number;
  /** images per request, 1..9 */
  perRequest: number;
}

export const DEFAULT_CONFIG: RequestyConfig = {
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  timeoutMs: 90_000,
  retries: 2,
  concurrency: 4,
  perRequest: 4,
};

interface ContentPart { type: string; text?: string; image_url?: { url: string } }

export function buildChatBody(cfg: RequestyConfig, prompt: string, imageDataUrls: string[]): unknown {
  const parts: ContentPart[] = [{ type: "text", text: prompt }];
  for (const url of imageDataUrls) parts.push({ type: "image_url", image_url: { url } });
  return {
    model: cfg.model,
    messages: [{ role: "user", content: parts }],
  };
}

export interface ChatUsage {
  tokensIn: number | null;
  tokensOut: number | null;
  tokensTotal: number | null;
  cost: number | null;
}

export type ChatParse =
  | { ok: true; text: string; usage: ChatUsage }
  | { ok: false; reason: string };

export function parseChatResponse(json: unknown): ChatParse {
  if (typeof json !== "object" || json === null) return { ok: false, reason: "response is not an object" };
  const x = json as Record<string, unknown>;
  const choices = x.choices;
  if (!Array.isArray(choices) || choices.length === 0) return { ok: false, reason: "no choices in response" };
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== "string") return { ok: false, reason: "no message content" };
  const u = (typeof x.usage === "object" && x.usage !== null ? x.usage : {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    ok: true,
    text: content,
    usage: { tokensIn: num(u.prompt_tokens), tokensOut: num(u.completion_tokens), tokensTotal: num(u.total_tokens), cost: num(u.cost) },
  };
}

export type FailureKind = "auth" | "rate" | "model" | "payload" | "timeout" | "network" | "malformed" | "unknown";

export interface RequestFailure {
  kind: FailureKind;
  retryable: boolean;
  /** never contains the key or raw provider detail */
  safeMessage: string;
}

export function classifyStatus(status: number, bodyText: string, key: string): RequestFailure {
  const body = safeBody(bodyText);
  const kind = kindFor(status, (body.error?.code ?? "").toString());
  return { kind, retryable: kind === "rate", safeMessage: scrub(key, status, body) };
}

function kindFor(status: number, code: string): FailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate";
  if (status === 400) return bad400(code);
  if (status === 404) return "model";
  if (status === 413) return "payload";
  if (status === 408 || status === 504) return "timeout";
  return "unknown";
}

function bad400(code: string): FailureKind {
  return /model/i.test(code) ? "model" : "payload";
}

function scrub(key: string, status: number, body: { error?: { message?: string } }): string {
  const raw = body.error?.message ?? `HTTP ${status}`;
  return redact(raw.replace(/\s+/g, " ").slice(0, 160), key);
}

interface SafeBody { error?: { message?: string; code?: string | null } }

function safeBody(text: string): SafeBody {
  try {
    const d = JSON.parse(text) as { error?: { message?: string; code?: string | null } };
    return typeof d === "object" && d !== null ? d : {};
  } catch {
    return {};
  }
}
