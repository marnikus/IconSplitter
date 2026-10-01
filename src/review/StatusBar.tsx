// StatusBar.tsx — the bottom status bar (design): index state, last rescan,
// the rescan diff, the count of decisions still waiting for a write and the
// review progress bar. Every figure comes from state, never from a guess.

import { relativeTime } from "../lib/reviewformat";
import { reviewedCount, type Counts } from "../lib/reviewmerge";
import { useTick } from "../ui/useTick";
import type { ScanDelta } from "./api";

export interface StatusBarProps {
  rootName: string;
  busy: string | null;
  lastScanAt: number | null;
  delta: ScanDelta | null;
  unsaved: number;
  counts: Counts;
  watcher: boolean;
}

export default function StatusBar(props: StatusBarProps) {
  const now = useTick(1000);
  return (
    <footer className="panel flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" data-testid="review-statusbar">
      <IndexState {...props} />
      {props.lastScanAt && <span className="text-slate-400">Last rescan: {relativeTime(props.lastScanAt, now)}</span>}
      {props.delta && <Delta delta={props.delta} />}
      <div className="ml-auto flex items-center gap-4">
        {props.unsaved > 0 && (
          <span className="text-amber-300" data-testid="status-unsaved">
            ⚠ {props.unsaved} decision{props.unsaved === 1 ? "" : "s"} awaiting retry
          </span>
        )}
        <Progress counts={props.counts} />
      </div>
    </footer>
  );
}

function IndexState({ rootName, busy, watcher }: StatusBarProps) {
  const tone = busy ? "bg-amber-400" : watcher && rootName ? "bg-emerald-400" : "bg-slate-500";
  const text = busy ? busy : rootName ? (watcher ? "Recursive index ready" : "Watcher paused") : "No folder selected";
  return (
    <span className="inline-flex items-center gap-2 text-slate-300" data-testid="status-index">
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden="true" />
      {text}
    </span>
  );
}

function Delta({ delta }: { delta: ScanDelta }) {
  return (
    <span className="text-slate-400" data-testid="status-delta">
      +{delta.added} new · {delta.renamed} renamed · {delta.removed} removed · {delta.kept} unchanged
    </span>
  );
}

function Progress({ counts }: { counts: Counts }) {
  const done = reviewedCount(counts);
  const pct = counts.total === 0 ? 0 : Math.round((done / counts.total) * 100);
  return (
    <span className="flex items-center gap-2" data-testid="status-progress">
      <span className="tabular-nums text-slate-300">{done} / {counts.total} reviewed</span>
      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10" role="progressbar"
        aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Reviewed pairs">
        <span className="block h-full rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
