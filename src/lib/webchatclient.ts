// webchatclient.ts — the loopback helper's /aichat routes (2026-11-03). One
// call = one ChatGPT turn: the reference PNG and the prompt go ONLY to the
// helper on 127.0.0.1, which types them into the user's own chat. The answer is
// the reply text; the run extracts and saves the SVG exactly as for an API reply.

import { isRecord } from "./isrecord";
import { HELPER_FIX_HINT, helperBase } from "./helperurl";
import type { WebChatTarget } from "./webchatprefs";

export type WebChatCode =
  | "helper-down" | "helper-old" | "bad-request" | "auth" | "busy" | "browser" | "page"
  | "timeout" | "cancelled" | "reply_was_file" | "limit";

export type WebChatResult =
  | { ok: true; text: string; chatUrl: string | null; restarted: boolean }
  | { ok: false; code: WebChatCode; reason: string };

export interface WebChatInput {
  bridgeUrl?: string;
  target: WebChatTarget;
  prompt: string;
  /** The reference image as a PNG data URL; null = a text-only turn. */
  image: string | null;
  /** Names this turn for progress and cancel. */
  sessionKey: string;
  /** The prompt's own icon line: the helper reads the reply below that prompt. */
  anchor?: string;
  signal?: AbortSignal;
  /** The helper's phase: opening, waiting-for-login, uploading, typing, generating, restarting-chat, scraping. */
  onPhase?: (phase: string) => void;
  fetchImpl?: typeof fetch;
  pollMs?: number;
}

const CODES: readonly WebChatCode[] = ["bad-request", "auth", "busy", "browser", "page", "timeout", "cancelled", "reply_was_file", "limit"];

function failureOf(status: number, body: unknown): WebChatResult {
  if (status === 404) return { ok: false, code: "helper-old", reason: `the local helper predates web generation — restart it (${HELPER_FIX_HINT})` };
  const code = isRecord(body) && CODES.includes(body.code as WebChatCode) ? body.code as WebChatCode : "page";
  const reason = isRecord(body) && typeof body.reason === "string" && body.reason !== "" ? body.reason : `the local helper answered HTTP ${status}`;
  return { ok: false, code, reason: reason.slice(0, 300) };
}

function successOf(body: unknown): WebChatResult {
  if (!isRecord(body) || typeof body.text !== "string") return { ok: false, code: "page", reason: "the local helper returned no reply text" };
  return { ok: true, text: body.text, chatUrl: typeof body.chatUrl === "string" ? body.chatUrl : null, restarted: body.restarted === true };
}

async function bodyOf(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Polls the helper's phase until `stop` resolves; never throws. */
function followProgress(input: WebChatInput, base: string, fetchFn: typeof fetch): () => void {
  let live = true;
  let last = "";
  const tick = async () => {
    if (!live || input.onPhase === undefined) return;
    try {
      const body = await bodyOf(await fetchFn(`${base}/aichat/progress?sessionKey=${encodeURIComponent(input.sessionKey)}`));
      const phase = isRecord(body) && isRecord(body.progress) && typeof body.progress.phase === "string" ? body.progress.phase : "";
      if (live && phase !== "" && phase !== last) { last = phase; input.onPhase(phase); }
    } catch { /* the next tick tries again */ }
  };
  const timer = setInterval(() => { void tick(); }, input.pollMs ?? 1000);
  return () => { live = false; clearInterval(timer); };
}

function cancelTurn(base: string, sessionKey: string, fetchFn: typeof fetch): void {
  void fetchFn(`${base}/aichat/cancel`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionKey }),
  }).catch(() => undefined);
}

/** Sends one turn to the user's ChatGPT chat through the local helper. */
export async function sendWebChat(input: WebChatInput): Promise<WebChatResult> {
  const fetchFn = input.fetchImpl ?? globalThis.fetch;
  const base = helperBase(input.bridgeUrl);
  const stop = followProgress(input, base, fetchFn);
  const onAbort = () => cancelTurn(base, input.sessionKey, fetchFn);
  input.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchFn(`${base}/aichat/send`, {
      method: "POST", signal: input.signal, headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input.target, prompt: input.prompt, image: input.image, sessionKey: input.sessionKey, anchor: input.anchor }),
    });
    const body = await bodyOf(res);
    return res.ok ? successOf(body) : failureOf(res.status, body);
  } catch {
    if (input.signal?.aborted) return { ok: false, code: "cancelled", reason: "the web generation was cancelled" };
    return { ok: false, code: "helper-down", reason: `cannot reach the local helper — ${HELPER_FIX_HINT}` };
  } finally {
    stop();
    input.signal?.removeEventListener("abort", onAbort);
  }
}
