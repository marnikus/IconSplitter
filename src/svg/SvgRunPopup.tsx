// SvgRunPopup.tsx — the run's floating line, visible on EVERY tab (keep-alive D2).
// Why: a run keeps going while the user works elsewhere, and without this the
// only sign of it was on the Generate SVG tab. One line: how many images are done,
// how many are left (waiting batches included), which request, and the elapsed
// time. When the run ends the line keeps its final words until dismissed, so a
// user on another tab does not miss the end. It logs nothing of its own (D7).

import { useState } from "react";
import Elapsed from "./Elapsed";
import { runTotals, type RunTotals } from "./runtotals";
import type { QueueItem, RunProgress } from "./types";

export interface SvgRunPopupProps {
  progress: RunProgress | null;
  queue: QueueItem[];
  running: boolean;
  onOpen: () => void;
  onCancel: () => void;
}

export default function SvgRunPopup(p: SvgRunPopupProps) {
  // The dismissed run is remembered by identity: a new run is a new progress object.
  const [dismissed, setDismissed] = useState<RunProgress | null>(null);
  const shown = p.running || p.queue.length > 0 || (p.progress !== null && p.progress !== dismissed);
  if (!shown) return null;
  const totals = runTotals(p.progress, p.queue);
  return (
    <section className="svg-run-popup" data-testid="svg-run-popup" role="status" aria-live="polite">
      <span className="svg-run-popup-line" data-testid="svg-run-popup-line">{popupLine(totals, p.running)}</span>
      {p.running && p.progress !== null && <Elapsed startedAt={p.progress.startedAt} running testid="svg-run-popup-elapsed" />}
      <button type="button" className="svg-btn tiny" data-testid="svg-run-popup-open" onClick={p.onOpen}>Open</button>
      {p.running
        ? <button type="button" className="svg-btn tiny danger" data-testid="svg-run-popup-cancel" onClick={p.onCancel}>Cancel</button>
        : <button type="button" className="svg-btn tiny" data-testid="svg-run-popup-dismiss" aria-label="Dismiss run summary" onClick={() => setDismissed(p.progress)}>×</button>}
    </section>
  );
}

/** The words of the line, from the one totals function (D2). */
export function popupLine(t: RunTotals, running: boolean): string {
  if (!running) return `Done · ${t.done} done · ${t.left} left · ${t.failed} failed`;
  return `Generating · ${t.done} done · ${t.left} left · request ${t.request} of ${t.requests}`;
}
