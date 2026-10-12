// SvgRunPopup.tsx — the run's numbers on EVERY tab (2026-10-08, finding 2).
// A small fixed window: "Generating · 7 done · 13 left · request 2 of 5" from
// the one arithmetic in runtotals.ts, so it can never disagree with the bulk
// bar or the log. It is portalled to <body> because the panel that owns the
// run is parked `hidden` on other tabs, and a hidden ancestor hides a fixed
// child too. The final "Done" line stays until the user dismisses it; a new
// run brings the popup back.

import { useState } from "react";
import { createPortal } from "react-dom";
import { runTotals, totalsLine, withChain, type Chain } from "./runtotals";
import type { QueueItem } from "./runqueue";
import type { RunProgress } from "./types";

interface Props {
  progress: RunProgress | null;
  running: boolean;
  queue: readonly QueueItem[];
  /** What the runs before this one in the same queue did. */
  chain: Chain;
}

export default function SvgRunPopup({ progress, running, queue, chain }: Props) {
  // the run the user dismissed; a new run (a new id) brings the popup back
  const [dismissed, setDismissed] = useState<string | null>(null);
  const runId = progress === null ? null : progress.runId;
  if (progress === null || runId === dismissed) return null;
  const line = totalsLine(withChain(runTotals(progress, queue), chain), running);
  return createPortal(
    <div className={`svg-run-popup${running ? " running" : ""}`} role="status" aria-live="polite" data-testid="svg-run-popup">
      <span className="svg-run-popup-dot" aria-hidden="true" />
      <span data-testid="svg-run-popup-line">{line}</span>
      <button type="button" className="svg-run-popup-close" data-testid="svg-run-popup-dismiss"
        aria-label="Dismiss" title="Dismiss" onClick={() => setDismissed(runId)}>×</button>
    </div>,
    document.body,
  );
}
