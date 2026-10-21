// Shared visual language for Batch, Generate SVG, Upload and future batch tasks.
// Callers own lifecycle, thumbnails and actions; this component never starts work.
import type { ReactNode } from "react";

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
}

export default function ProcessProgressBar(p: ProcessProgressBarProps) {
  const cls = `${p.theme}-progress`;
  return (
    <div className={`${cls}-header process-progress-header${p.complete ? " complete" : ""}`} data-testid={`${p.prefix}-progress-header`}>
      <div className={`${cls}-left`}>
        {p.leading}
        <div className={`${cls}-text`}>
          <strong className={p.complete ? "success" : undefined} data-testid={`${p.prefix}-progress-title`}>{p.title}</strong>
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
