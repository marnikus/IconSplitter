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
  /** One extra honest line next to "N remaining" (e.g. how many files a pass registered). */
  note?: string;
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
  const cls = `${p.theme}-progress`;
  useCompletionCue(p.runId, p.status, p.total);
  const titleClass = p.status === "failed" ? "error" : p.status === "completed" ? "success" : undefined;
  return (
    <div className={`${cls}-header process-progress-header${CLASSES[p.status]}`} data-testid={`${p.prefix}-progress-header`}
      data-status={p.status}>
      <div className={`${cls}-left`}>
        <Leading p={p} />
        <div className={`${cls}-text`}>
          <strong className={titleClass} data-testid={`${p.prefix}-progress-title`}>{p.title}</strong>
          <span className={`${cls}-file`} data-testid={`${p.prefix}-progress-file`} title={p.detail}>{p.detail}</span>
        </div>
      </div>
      <ProcessStats p={p} />
      <div className={`${cls}-right`}>
        <span className={`${cls}-percent`} data-testid={`${p.prefix}-progress-percent`}>{p.percent}%</span>
        <ProcessActions p={p} />
      </div>
    </div>
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
      <button type="button" className="svg-btn tiny" data-testid={`${p.prefix}-progress-cancel`}
        disabled={p.cancelDisabled === true} onClick={p.onCancel}>{p.cancelLabel ?? "✕ Cancel"}</button>
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

function ProcessStats({ p }: { p: ProcessProgressBarProps }) {
  const cls = `${p.theme}-progress`;
  return (
    <div className={`${cls}-center`}>
      <div className={`${cls}-track`} data-testid={`${p.prefix}-progress-track`} role="progressbar" aria-label={p.title}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.percent} aria-valuetext={`${p.done} of ${p.total} processed`}>
        <div className={`${cls}-fill`} style={{ width: `${p.percent}%` }} />
      </div>
      <div className={`${cls}-stats`}>
        <span data-testid={`${p.prefix}-progress-completed`}>{p.done} completed / {p.total}</span>
        <span data-testid={`${p.prefix}-progress-remaining`}>{p.remaining} remaining</span>
        {p.note ? <span className={`${cls}-note`} data-testid={`${p.prefix}-progress-note`}>{p.note}</span> : null}
      </div>
    </div>
  );
}
