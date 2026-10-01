// RootBar.tsx — the Selection header: the split root, Rescan, how much was
// scanned and the four counters (design header row). The counters are read-only
// figures; the status filter lives in the filter bar (RULE 10).

import type { Counts } from "../lib/reviewmerge";
import type { ReviewApi } from "./api";

export default function RootBar({ r, folders }: { r: ReviewApi; folders: number }) {
  return (
    <section className="panel flex flex-wrap items-center gap-3" data-testid="review-rootbar">
      <button type="button" data-testid="review-root" className="btn-primary max-w-[22rem] truncate" onClick={r.pickRoot}>
        <span aria-hidden="true">📁</span>
        {r.s.rootName ? `Root: ${r.s.rootName}` : "Choose split root…"}
      </button>
      <button type="button" data-testid="review-refresh" className="btn-ghost" onClick={() => r.rescan("manual")}>
        <span aria-hidden="true">↺</span> Rescan
      </button>
      <p className="text-xs text-slate-400" data-testid="review-recursive">
        Recursive · {folders} nested folder{folders === 1 ? "" : "s"}
      </p>
      <div className="ml-auto">
        <StatChips counts={r.s.counts} />
      </div>
    </section>
  );
}

function StatChips({ counts }: { counts: Counts }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite" data-testid="review-counters">
      <Chip value={counts.total} label="total" cls="text-slate-100" />
      <Chip value={counts.pending} label="pending" cls="text-amber-200" />
      <Chip value={counts.approved} label="approved" cls="text-emerald-200" />
      <Chip value={counts.declined} label="declined" cls="text-rose-200" />
    </div>
  );
}

function Chip({ value, label, cls }: { value: number; label: string; cls: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
      <b data-testid={`count-${label}`} className={`tabular-nums ${cls}`}>{value}</b>
      <span className="text-xs text-slate-400">{label}</span>
    </span>
  );
}
