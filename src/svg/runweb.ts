// runweb.ts — the web-page transport of ONE request (2026-11-03): instead of
// the provider API, the local helper types the prompt and the reference image
// into the user's ChatGPT conversation and hands back the reply text. Never
// retried automatically (the chat may still be answering). A reply from a NEW
// chat (the helper restarted after the max wait) moves the run — and the saved
// setting, through `onChatUrl` — to that chat.

import { sendWebChat, type WebChatCode } from "../lib/webchatclient";
import type { Failure, Usage } from "../lib/svgrequest";
import type { BuiltComposite } from "./composite";
import type { BatchCtx } from "./runbatch";
import type { WebRun } from "./runtypes";

export type WebSend =
  | { ok: true; text: string; usage: Usage; requestId: string | null }
  | { ok: false; error: string; failure: Failure["kind"]; retryAfterMs: number | null };

/** A web turn costs no metered tokens: every count is unknown, never zero-billed. */
export const WEB_USAGE: Usage = { input: null, output: null, total: null, cost: null, currency: "USD" };

const KINDS: Partial<Record<WebChatCode, Failure["kind"]>> = {
  auth: "auth", cancelled: "aborted", timeout: "provider_timeout", "bad-request": "payload",
  "helper-down": "network", "helper-old": "network", browser: "network", busy: "rate_limit", reply_was_file: "malformed",
};

export function failureKindOf(code: WebChatCode): Failure["kind"] {
  return KINDS[code] ?? "provider";
}

/** Sends the request text and the composite through the helper's browser. */
export async function sendWebRequest(ctx: BatchCtx, web: WebRun, composite: BuiltComposite, prompt: string): Promise<WebSend> {
  const out = await sendWebChat({
    bridgeUrl: web.bridgeUrl, target: web.target, prompt, image: composite.dataUrl,
    sessionKey: `${ctx.state.runId}:${ctx.plan.id}`, signal: ctx.signal, onPhase: web.onPhase,
  });
  if (!out.ok) return { ok: false, error: `ChatGPT web: ${out.reason}`, failure: failureKindOf(out.code), retryAfterMs: null };
  followChat(web, out.chatUrl);
  return { ok: true, text: out.text, usage: WEB_USAGE, requestId: null };
}

/** The next request goes to the chat that answered; the setting follows it. */
function followChat(web: WebRun, chatUrl: string | null): void {
  if (chatUrl === null || chatUrl === web.target.url || !/^https:\/\/[^/]+\/(?:.*\/)?c\//.test(chatUrl)) return;
  web.target = { ...web.target, url: chatUrl };
  web.onChatUrl?.(chatUrl);
}
