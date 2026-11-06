// ProgressFrame.tsx — the one visual frame of every progress bar: header,
// title/detail, track, counts and percent. Pure layout: no lifecycle, no
// sound, no buttons of its own. Job bars (ProcessProgressBar) add the job
// lifecycle on top; activity bars (ActivityBars) add nothing — they vanish
// when their work ends. `percent: null` draws an indeterminate track.
import type { ReactNode } from "react";

export interface ProgressFrameProps {
  prefix: string;
  theme: "svg" | "batch";
  title: string;
  detail: string;
  done: number;
  total: number;
  remaining: number;
  /** null = no count known yet: an animated, indeterminate track. */
  percent: number | null;
  leading: ReactNode;
  actions: ReactNode;
  /** State classes for the header (" complete", " failed", …), already spaced. */
  stateClass?: string;
  /** The lifecycle state, mirrored as data-status for styles and tests. */
  status?: string;
  titleClass?: string;
  note?: string;
}

export default function ProgressFrame(p: ProgressFrameProps) {
  const cls = `${p.theme}-progress`;
  return (
    <div className={`${cls}-header process-progress-header${p.stateClass ?? ""}`} data-testid={`${p.prefix}-progress-header`}
      data-status={p.status}>
      <div className={`${cls}-left`}>
        {p.leading}
        <div className={`${cls}-text`}>
          <strong className={p.titleClass} data-testid={`${p.prefix}-progress-title`}>{p.title}</strong>
          <span className={`${cls}-file`} data-testid={`${p.prefix}-progress-file`} title={p.detail}>{p.detail}</span>
        </div>
      </div>
      <FrameStats p={p} />
      <div className={`${cls}-right`}>
        <span className={`${cls}-percent`} data-testid={`${p.prefix}-progress-percent`}>{p.percent === null ? "…" : `${p.percent}%`}</span>
        {p.actions}
      </div>
    </div>
  );
}

function FrameStats({ p }: { p: ProgressFrameProps }) {
  const cls = `${p.theme}-progress`;
  const known = p.percent !== null;
  return (
    <div className={`${cls}-center`}>
      <div className={`${cls}-track${known ? "" : " indeterminate"}`} data-testid={`${p.prefix}-progress-track`} role="progressbar"
        aria-label={p.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? p.percent ?? 0 : undefined}
        aria-valuetext={known ? `${p.done} of ${p.total} processed` : "working"}>
        <div className={`${cls}-fill`} style={{ width: known ? `${p.percent}%` : undefined }} />
      </div>
      {known ? (
        <div className={`${cls}-stats`}>
          <span data-testid={`${p.prefix}-progress-completed`}>{p.done} completed / {p.total}</span>
          <span data-testid={`${p.prefix}-progress-remaining`}>{p.remaining} remaining</span>
          {p.note ? <span className={`${cls}-note`} data-testid={`${p.prefix}-progress-note`}>{p.note}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
