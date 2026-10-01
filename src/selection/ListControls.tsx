// ListControls.tsx — multi-selection + bulk decisions for the review list.
// Header checkbox is tri-state (checked/unchecked/indeterminate); bulk
// actions affect only selected AND visible pairs (spec §5/§6).

import { useEffect, useRef } from "react";

export interface ListControlsProps {
  visibleIds: string[];
  selectedIds: string[];
  wrap: boolean;
  thumbSize: "sm" | "lg";
  toggle: (id: string) => void;
  selectVis: (ids: string[], on: boolean) => void;
  bulk: (d: "approved" | "declined") => void;
  bulkResetSel: () => void;
  patch: (p: { wrap?: boolean; thumbSize?: "sm" | "lg" }) => void;
}

export function affectedCount(p: ListControlsProps): number {
  const vis = new Set(p.visibleIds);
  return p.selectedIds.filter((id) => vis.has(id)).length;
}

export default function ListControls(p: ListControlsProps) {
  const n = affectedCount(p);
  const allOn = p.visibleIds.length > 0 && p.visibleIds.every((id) => p.selectedIds.includes(id));
  const someOn = p.visibleIds.some((id) => p.selectedIds.includes(id));
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <HeaderCheck allOn={allOn} someOn={someOn} p={p} />
      <button className="btn-ghost sel-focus" data-testid="sel-select-all" onClick={() => p.selectVis(p.visibleIds, !allOn)}>
        {allOn ? "Deselect all" : "Select all visible"}
      </button>
      <span className="text-slate-400" data-testid="sel-selcount">{n} selected</span>
      <BulkBtns n={n} bulk={p.bulk} bulkResetSel={p.bulkResetSel} />
      <label className="flex items-center gap-1 text-slate-400">Wrap
        <input type="checkbox" className="accent-indigo-500" data-testid="sel-wrap" checked={p.wrap}
          onChange={(e) => p.patch({ wrap: e.target.checked })} />
      </label>
      <button className="btn-mini sel-focus" data-testid="sel-thumbsize" title="Thumbnail size"
        onClick={() => p.patch({ thumbSize: p.thumbSize === "sm" ? "lg" : "sm" })}>
        {p.thumbSize === "sm" ? "Thumbs S" : "Thumbs L"}
      </button>
    </div>
  );
}

function BulkBtns({ n, bulk, bulkResetSel }: { n: number; bulk: (d: "approved" | "declined") => void; bulkResetSel: () => void }) {
  return (
    <span className="ml-auto flex items-center gap-2">
      <button
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 font-semibold text-slate-300 hover:bg-white/10 disabled:opacity-40 sel-focus"
        disabled={n === 0} data-testid="sel-bulk-reset" onClick={bulkResetSel}
      >↺ Reset selected ({n})</button>
      <button
        className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40 sel-focus"
        disabled={n === 0} data-testid="sel-bulk-approve" onClick={() => bulk("approved")}
      >✓ Approve selected ({n})</button>
      <button
        className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-1 font-semibold text-rose-300 hover:bg-rose-500/25 disabled:opacity-40 sel-focus"
        disabled={n === 0} data-testid="sel-bulk-decline" onClick={() => bulk("declined")}
      >✕ Decline selected ({n})</button>
    </span>
  );
}

function HeaderCheck({ allOn, someOn, p }: { allOn: boolean; someOn: boolean; p: ListControlsProps }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someOn && !allOn;
  }, [someOn, allOn]);
  return (
    <input
      ref={ref} type="checkbox" className="h-4 w-4 accent-indigo-500" data-testid="sel-check-all"
      checked={allOn} onChange={() => p.selectVis(p.visibleIds, !allOn)}
      aria-label="Select all visible pairs"
    />
  );
}
