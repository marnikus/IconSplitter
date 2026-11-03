// SvgConfirmWeb.tsx — the LIVE WEB parts of the confirmation (2026-11-03).
// The web popup IS the API popup (same prompt picker, sheet pager and full
// prompt preview, SvgConfirm.tsx); only these parts differ: the LIVE WEB mark,
// the chat URL and the two waits (stored as they are typed), and the policy
// note that says exactly what leaves the machine and where it goes.

import { clampMinutes, webChatTargetOf, type WebChatTarget } from "../lib/webchatprefs";
import { patchWebChat, useWebChatPrefs } from "./webchatstore";

/** The stored settings as a run target, or the reason the popup cannot confirm. */
export function useWebTarget(): { target: WebChatTarget | null; problem: string | null } {
  const res = webChatTargetOf(useWebChatPrefs());
  return res.ok ? { target: res.target, problem: null } : { target: null, problem: res.problem };
}

export function LiveWebBadge() {
  return (
    <p className="svg-note warn strong" data-testid="svg-confirm-live-web">
      ● LIVE WEB — the local helper opens your ChatGPT chat in a browser window and types each request there
    </p>
  );
}

export function WebFacts({ count, requests }: { count: number; requests: number }) {
  const prefs = useWebChatPrefs();
  const { problem } = useWebTarget();
  return (
    <div className="svg-facts">
      <div className="svg-fact"><span>Selected images</span><strong data-testid="svg-confirm-count">{count}</strong></div>
      <div className="svg-fact"><span>Requests</span><strong data-testid="svg-confirm-requests">{`${requests} × 1 max`}</strong></div>
      <label className="svg-fact">
        <span>Chat URL</span>
        <input type="url" className="svg-input" data-testid="svg-web-url" value={prefs.url} placeholder="https://chatgpt.com/c/…"
          onChange={(e) => patchWebChat({ url: e.target.value })} />
      </label>
      {problem !== null && <p className="svg-note error" data-testid="svg-web-url-problem">{problem}</p>}
      <MinutesField label="Max wait for a reply, then new chat (min)" testid="svg-web-maxwait" value={prefs.maxWaitMin}
        onChange={(n) => patchWebChat({ maxWaitMin: n })} />
      <MinutesField label="Wait for the chat / sign-in (min)" testid="svg-web-ready" value={prefs.readyTimeoutMin}
        onChange={(n) => patchWebChat({ readyTimeoutMin: n })} />
    </div>
  );
}

function MinutesField(p: { label: string; testid: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="svg-fact">
      <span>{p.label}</span>
      <input type="number" min={1} max={60} className="svg-input" data-testid={p.testid} value={p.value}
        onChange={(e) => p.onChange(clampMinutes(e.target.value === "" ? p.value : Number(e.target.value), p.value))} />
    </label>
  );
}

export function WebPolicyNote() {
  return (
    <p className="svg-note" data-testid="svg-web-policy">
      Each request sends ONE reference image and the prompt shown above (with the current SVG code when regenerating) to
      the local helper on 127.0.0.1, which pastes them into the chat URL above in a browser window and waits until the
      reply stops changing. The SVG code of the reply is saved as the next version — nothing is overwritten. If no finished
      reply arrives within the max wait, the helper starts a new chat once and the saved URL is replaced with it. Requests
      run one at a time, are never resent automatically, and record no token cost. Sign in to ChatGPT in that window the
      first time; the helper keeps the sign-in in its own browser profile.
    </p>
  );
}
