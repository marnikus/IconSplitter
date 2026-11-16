// GettyWaitInfo.tsx — what the Getty web upload is waiting for, said out loud
// (2026-11-12). While Getty's page does not take the files the helper waits and
// retries: it reloads the page, presses Save metadata again, re-uploads. The
// bar used to sit silent through those waits; now a line says what it waits
// for, what comes next (and which attempt), a counter runs down to it, and
// "Retry now" skips the timer. When no timer runs, the line says what the
// helper is doing (e.g. "Reloading the Getty page…").

import { useEffect, useState } from "react";
import type { StepWait, UploadProgressStep } from "./batchtypes";

/** A time left as m:ss. */
export function waitClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "Waiting 0:23 — then: reload the Getty page … (1 of 2)"; once the time is up, "Now: …". */
export function waitText(wait: Pick<StepWait, "next" | "attempt" | "of">, remainingMs: number): string {
  const lead = remainingMs > 0 ? `Waiting ${waitClock(remainingMs)} — then: ` : "Now: ";
  const attempt = wait.attempt !== undefined && wait.of !== undefined ? ` (${wait.attempt} of ${wait.of})` : "";
  return `${lead}${wait.next}${attempt}`;
}

/** The time left of a wait: counted from when the helper reported it, ticking every second on its own. */
function useRemaining(wait: StepWait | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (wait === undefined) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [wait]);
  return wait === undefined ? 0 : Math.max(0, wait.readAt + wait.remainingMs - now);
}

/** The bar's note: the wait with its live counter, else what the helper is doing now. */
export function GettyWaitNote({ step }: { step: UploadProgressStep }) {
  const left = useRemaining(step.wait);
  if (step.wait !== undefined) {
    return (
      <span className="getty-wait" role="status" data-testid="stock-upload-wait" title={step.wait.reason}>
        ⏱ {waitText(step.wait, left)}<small> · {step.wait.reason}</small>
      </span>
    );
  }
  if (step.activity !== undefined) {
    return <span className="getty-wait doing" role="status" data-testid="stock-upload-activity">↻ {step.activity}</span>;
  }
  return null;
}

/** "Retry now": only for a retry timer (a deadline cannot be skipped) and only when the run can be told. */
export function GettyWaitSkip({ step }: { step: UploadProgressStep }) {
  if (step.wait === undefined || !step.wait.skippable || step.skipWait === undefined) return null;
  return (
    <button type="button" className="svg-btn tiny" data-testid="stock-upload-wait-skip" onClick={step.skipWait}
      title="Skip the wait and do the next step now">
      {step.wait.skipLabel !== undefined ? `⏭ ${step.wait.skipLabel}` : "↻ Retry now"}
    </button>
  );
}
