// ReviewCounters.tsx — total / pending / approved / declined counters (spec §2).
// The counters double as the status filter, so one click both reads and filters
// (RULE 10 — one control per decision). Text + icon, keyboard reachable.

import type { Counts } from "../lib/reviewmerge";
import type { StatusFilter } from "../lib/reviewquery";

export interface ReviewCountersProps {
  counts: Counts;
  active: StatusFilter;
  onPick: (status: StatusFilter) => void;
}

interface Chip {
  key: StatusFilter;
  label: string;
  icon: string;
  tone: string;
}

const CHIPS: Chip[] = [
  { key: "all", label: "Total", icon: "▦", tone: "text-slate-200" },
  { key: "pending", label: "Pending", icon: "○", tone: "text-slate-200" },
  { key: "approved", label: "Approved", icon: "✓", tone: "text-emerald-200" },
  { key: "declined", label: "Declined", icon: "✕", tone: "text-rose-200" },
];

export default function ReviewCounters(props: ReviewCountersProps) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="review-counters" role="group" aria-label="Review status filter">
      {CHIPS.map((chip) => <ChipView key={chip.key} chip={chip} {...props} />)}
    </div>
  );
}

function ChipView({ chip, counts, active, onPick }: { chip: Chip } & ReviewCountersProps) {
  const value = chip.key === "all" ? counts.total : counts[chip.key];
  const on = active === chip.key;
  return (
    <button
      type="button"
      data-testid={`counter-${chip.key}`}
      aria-pressed={on}
      onClick={() => onPick(chip.key)}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition ${
        on ? "border-indigo-400/60 bg-indigo-500/20 text-white" : "border-white/10 bg-white/[0.03] hover:bg-white/10"
      }`}
    >
      <span aria-hidden="true" className={chip.tone}>{chip.icon}</span>
      <span className="text-slate-300">{chip.label}</span>
      <b className="tabular-nums">{value}</b>
    </button>
  );
}
