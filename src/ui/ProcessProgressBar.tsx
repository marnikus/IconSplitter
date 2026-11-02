// Shared visual language for Batch, Generate SVG, Upload, stock upload and the
// register passes. Callers own lifecycle, thumbnails and actions; this component
// never starts work. It DOES own one thing: the completion cue. A finished bar is
// the single place that knows a process ended, so `cue` is what plays the sound —
// no path can finish a bar silently again (2026-11-02).
import { useEffect, useRef, type ReactNode } from "react";
import { notifyBarCompletion } from "./completionSound";

export interface ProcessProgressBarProps {
  prefix: string;
  theme: "svg" | "batch";
  title: string;
  detail: string;
  done: number;
  total: number;
  remaining: number;
  percent: number;
  leading: ReactNode;
  actions: ReactNode;
  complete?: boolean;
  /** The run ended with files that did not upload: not a success colour. */
  failed?: boolean;
  /**
   * Identity of the process this bar reports — the same id its feature would use
   * for its own cue, so one completion never sounds twice.
   */
  cue?: string | null;
  /** The run was cancelled or stopped: it ended, but it is not a completion. */
  cueSilent?: boolean;
}

/** One sound per finished bar, never per render and never for a stopped run. */
function useCompletionCue(cue: string | null | undefined, complete: boolean, silent: boolean): void {
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (cue === null || cue === undefined || !complete || silent) return;
    if (fired.current === cue) return;
    fired.current = cue;
    notifyBarCompletion(cue);
  }, [cue, complete, silent]);
}

export default function ProcessProgressBar(p: ProcessProgressBarProps) {
  const cls = `${p.theme}-progress`;
  // "complete" paints the bar green: only truthful when nothing failed.
  const success = p.complete === true && p.failed !== true;
  useCompletionCue(p.cue, p.total > 0 && p.complete === true, p.cueSilent === true);
  return (
    <div
      className={`${cls}-header process-progress-header${success ? " complete" : ""}${p.failed ? " failed" : ""}`}
      data-testid={`${p.prefix}-progress-header`}
    >
      <div className={`${cls}-left`}>
        {p.leading}
        <div className={`${cls}-text`}>
          <strong className={p.failed ? "error" : success ? "success" : undefined} data-testid={`${p.prefix}-progress-title`}>{p.title}</strong>
          <span className={`${cls}-file`} data-testid={`${p.prefix}-progress-file`} title={p.detail}>{p.detail}</span>
        </div>
      </div>
      <ProcessStats p={p} />
      <div className={`${cls}-right`}>
        <span className={`${cls}-percent`} data-testid={`${p.prefix}-progress-percent`}>{p.percent}%</span>
        {p.actions}
      </div>
    </div>
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
      </div>
    </div>
  );
}
