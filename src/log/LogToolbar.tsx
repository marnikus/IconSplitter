// LogToolbar.tsx — the dock's actions: Copy all, Clear, the ONE "max entries"
// choice (stored AND displayed, RULE 10/24 — a select cannot hold a half-typed
// value that deletes entries), and a status line announced at most once a second.
// None of these is pushed to the undo timeline (D13): the log is diagnostic data.

import { useEffect, useRef, useState } from "react";
import { MAX_CHOICES } from "../lib/logprefs";
import { logger } from "./logger";
import { clearLog, copyAllText, getLog, setMax } from "./logstore";
import { useThrottled } from "./useLog";

const BLOCKED = "Clipboard is blocked by the browser — select the log text and copy it";

/** Copy all: the stored text, once, and the honest outcome — never a fake success (RULE 2/9). */
function useCopy(): { message: string | null; run: () => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = () => {
    const entries = getLog().entries.length;
    void Promise.resolve().then(() => navigator.clipboard.writeText(copyAllText())).then(
      () => report(`Copied ${entries} entries`, true, entries),
      () => report(BLOCKED, false, entries),
    );
  };
  const report = (text: string, ok: boolean, entries: number) => {
    setMessage(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 4000);
    logger("log")[ok ? "info" : "warn"]("copy", ok ? `Copied ${entries} entries` : "Copy was blocked by the browser", { data: { entries, ok } });
  };
  return { message, run };
}

export default function LogToolbar({ max, unseen }: { max: number; unseen: number }) {
  const copy = useCopy();
  const idle = unseen > 0 ? `${unseen} new ${unseen === 1 ? "entry" : "entries"}` : "";
  const status = useThrottled(copy.message ?? idle);
  return (
    <div className="log-tools">
      <button type="button" className="log-btn" data-testid="log-copy" onClick={copy.run}>Copy all</button>
      <button type="button" className="log-btn" data-testid="log-clear" onClick={clearLog}>Clear</button>
      <label className="log-max" htmlFor="log-max">Max entries</label>
      <select id="log-max" data-testid="log-max" className="log-select" value={max} onChange={(e) => setMax(Number(e.target.value))}>
        {MAX_CHOICES.map((n) => <option key={n} value={n}>{n.toLocaleString("en-US").replace(",", " ")}</option>)}
      </select>
      <span className="log-status" role="status" data-testid="log-status">{status}</span>
    </div>
  );
}
