// ProcessProgressBar.tsx — the ONE progress bar of every process in every tab
// (Batch split/preview, Generate SVG runs, AI image runs, register passes,
// Upload metadata/export/download, stock upload). Callers own the work, the
// counts and the words; the bar owns the LIFECYCLE, so no feature can behave
// differently (2026-11-03):
//   running   → the feature's thumbnail + Cancel; silent
//   completed → ✓ green, Review results + ✕; one completion sound
//   failed    → ! red,   Review results + ✕; one completion sound (it ended)
//   cancelled → ■,       Review results + ✕; silent; real percentage kept
// A finished bar stays until its ✕ (onDismiss) or until the feature starts its
// next run — the bar has no timer, and no caller may add one.
import { useEffect, useRef, type ReactNode } from "react";
import type { ProcessStatus } from "../lib/processprogress";
import { notifyBarCompletion } from "./completionSound";
import ProgressFrame from "./ProgressFrame";

export type { ProcessStatus } from "../lib/processprogress";

export interface ProcessProgressBarProps {
  prefix: string;
  theme: "svg" | "batch";
  title: string;
  detail: string;
  done: number;
  total: number;
  remaining: number;
  percent: number;
  /** Where the run is; everything else the bar shows and does follows from it. */
  status: ProcessStatus;
  /**
   * Identity of the process — the same id its feature uses for its own cue, so
   * one end never sounds twice and a new run is a new bar.
   */
  runId: string;
  /** The running bar's picture (thumbnail or glyph); a finished bar shows its mark. */
  leading?: ReactNode;
  onCancel: () => void;
  cancelLabel?: string;
  /** A stop is already on its way: Cancel stays visible but inert. */
  cancelDisabled?: boolean;
  /** Opens the tab where the results are. */
  onReview: () => void;
  /** The only way a finished bar goes away (besides the next run). */
  onDismiss: () => void;
  /** One extra honest line next to "N remaining" (e.g. how many files a pass registered; the Getty wait with its counter). */
  note?: ReactNode;
  /** Extra controls of a RUNNING bar, beside Cancel (the Getty "Retry now"); a finished bar drops them. */
  runningExtra?: ReactNode;
}

const MARKS: Record<Exclude<ProcessStatus, "running">, string> = { completed: "✓", failed: "!", cancelled: "■" };
const CLASSES: Record<ProcessStatus, string> = { running: "", completed: " complete", failed: " failed", cancelled: " cancelled" };

/** One sound per ended run that the user did not stop, never per render. */
function useCompletionCue(runId: string, status: ProcessStatus, total: number): void {
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (total <= 0 || (status !== "completed" && status !== "failed")) return;
    if (fired.current === runId) return;
    fired.current = runId;
    notifyBarCompletion(runId);
  }, [runId, status, total]);
}

export default function ProcessProgressBar(p: ProcessProgressBarProps) {
  useCompletionCue(p.runId, p.status, p.total);
  return (
    <ProgressFrame prefix={p.prefix} theme={p.theme} title={p.title} detail={p.detail} done={p.done} total={p.total}
      remaining={p.remaining} percent={p.percent} note={p.note} runId={p.runId} stateClass={CLASSES[p.status]} status={p.status}
      titleClass={p.status === "failed" ? "error" : p.status === "completed" ? "success" : undefined}
      leading={<Leading p={p} />} actions={<ProcessActions p={p} />} />
  );
}

function Leading({ p }: { p: ProcessProgressBarProps }) {
  if (p.status === "running") return <>{p.leading ?? null}</>;
  return <span className={`${p.theme}-progress-check`} data-testid={`${p.prefix}-progress-icon`} aria-hidden="true">{MARKS[p.status]}</span>;
}

/** The same controls in every tab: Cancel while running; Review results and ✕ after. */
function ProcessActions({ p }: { p: ProcessProgressBarProps }) {
  if (p.status === "running") {
    return (
      <>
        {p.runningExtra}
        <button type="button" className="svg-btn tiny" data-testid={`${p.prefix}-progress-cancel`}
          disabled={p.cancelDisabled === true} onClick={p.onCancel}>{p.cancelLabel ?? "✕ Cancel"}</button>
      </>
    );
  }
  return (
    <>
      <button type="button" className="svg-btn primary tiny" data-testid={`${p.prefix}-progress-review`} onClick={p.onReview}>
        → Review results
      </button>
      <button type="button" className={`${p.theme}-progress-close`} data-testid={`${p.prefix}-progress-dismiss`}
        aria-label={`Dismiss: ${p.title}`} onClick={p.onDismiss}>✕</button>
    </>
  );
}
