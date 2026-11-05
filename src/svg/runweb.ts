// runweb.ts — the web-page transport (2026-11-03): instead of the provider
// API, the local helper types each request into the user's ChatGPT chat and
// hands back the reply text. One transport per run, created at launch; it
// OWNS its chat URL, so a reply from a new chat (the helper restarted after
// the max wait) moves this transport — and, through `onChatUrl`, the saved
// setting — without mutating anything the run was given. Never retried
// automatically (the chat may still be answering).
//
// The helper drives ONE browser page, so the turns of every run in this tab go
// through it one at a time (parallel SVG runs queue here instead of failing
// with "busy"). A turn cancelled while it waits is never sent.

import { sendWebChat, type WebChatCode } from "../lib/webchatclient";
import { beginActivity } from "../lib/activity";
import { requestRefLine, withRequestRef } from "../lib/svgprompt";
import { isConversationUrl, webProviderOf, type WebChatTarget } from "../lib/webchatprefs";
import type { Failure, Usage } from "../lib/svgrequest";
import type { WebRequest, WebSend, WebTransport } from "./runtypes";

/** What a web version records as its model: what answered, never the API model. */
export const WEB_MODEL = "ChatGPT (web)";

/** A web turn costs no metered tokens: every count is unknown, never zero-billed. */
export const WEB_USAGE: Usage = { input: null, output: null, total: null, cost: null, currency: "USD" };

export interface WebHooks {
  bridgeUrl?: string;
  /** The helper answered from a new chat: replace the saved URL with it. */
  onChatUrl?: (url: string) => void;
  /** The helper's live phase (waiting-for-login, uploading, generating, …). */
  onPhase?: (phase: string) => void;
  /** How often the helper's progress is read (tests only). */
  pollMs?: number;
}

/** The helper's steps in the words the activity bar shows. */
const STEP_WORDS: Record<string, string> = {
  opening: "opening the chat", "waiting-for-login": "waiting for you to sign in", uploading: "attaching the image",
  typing: "pasting the prompt", sent: "prompt sent", generating: "ChatGPT is generating",
  "restarting-chat": "no reply — trying a new chat", scraping: "reading the reply",
};

function stepLabel(request: WebRequest, phase: string): string {
  return `ChatGPT web · ${request.label ?? "request"} — ${STEP_WORDS[phase] ?? phase}…`;
}

const KINDS: Partial<Record<WebChatCode, Failure["kind"]>> = {
  auth: "auth", cancelled: "aborted", timeout: "provider_timeout", "bad-request": "payload",
  "helper-down": "network", "helper-old": "network", browser: "network", busy: "rate_limit", limit: "rate_limit", reply_was_file: "malformed",
};

/** "r-<time>-<random>": unique per request, short enough to read in the chat. */
function newRequestRef(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function failureKindOf(code: WebChatCode): Failure["kind"] {
  return KINDS[code] ?? "provider";
}

const CANCELLED: WebSend = { ok: false, error: "cancelled before sending", failure: "aborted", retryAfterMs: null };

/** The end of the line every web turn of this tab waits behind. */
let tail: Promise<void> = Promise.resolve();

function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/** Runs `work` after every earlier turn has finished; null when cancelled while waiting. */
async function oneAtATime<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T | null> {
  let release: () => void = () => undefined;
  const mine = new Promise<void>((resolve) => { release = resolve; });
  const before = tail;
  // The next turn waits for the previous one AND this one, even if this one
  // gives up early — so leaving the line never lets two turns overlap.
  tail = before.then(() => mine);
  try {
    await Promise.race([before, untilAborted(signal)]);
    return signal.aborted ? null : await work();
  } finally {
    release();
  }
}

export function createWebTransport(target: WebChatTarget, hooks: WebHooks = {}): WebTransport {
  let url = target.url;
  const follow = (chatUrl: string | null) => {
    if (chatUrl === null || chatUrl === url || !isConversationUrl(chatUrl)) return;
    url = chatUrl;
    hooks.onChatUrl?.(chatUrl);
  };
  const turn = async (request: WebRequest): Promise<WebSend> => {
    // Visible from every tab while the chat works; closes itself when the reply is in.
    const activity = beginActivity("svg", stepLabel(request, "opening"));
    const onPhase = (phase: string) => { activity.update(stepLabel(request, phase)); hooks.onPhase?.(phase); };
    // A one-off id in the prompt: the helper reads the answer below THIS prompt,
    // even when the same icon was sent before in this chat.
    const ref = newRequestRef();
    const out = await sendWebChat({
      bridgeUrl: hooks.bridgeUrl, target: { ...target, url }, prompt: withRequestRef(request.prompt, ref), image: request.image,
      sessionKey: request.key, signal: request.signal, anchor: requestRefLine(ref), onPhase, pollMs: hooks.pollMs,
    }).finally(() => activity.end());
    if (!out.ok) return { ok: false, error: `ChatGPT web: ${out.reason}`, failure: failureKindOf(out.code), retryAfterMs: null };
    follow(out.chatUrl);
    return { ok: true, text: out.text, usage: WEB_USAGE, requestId: null };
  };
  return {
    model: WEB_MODEL,
    provider: () => webProviderOf(url),
    send: async (request) => (await oneAtATime(request.signal, () => turn(request))) ?? CANCELLED,
  };
}
