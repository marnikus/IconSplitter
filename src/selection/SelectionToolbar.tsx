// SelectionToolbar.tsx — review-list controls (spec §4-§7): layout toggle,
// thumbnail max-height zoom slider, selection controls and bulk actions.
// One control per decision (RULE 10): the Next-pending toggle lives here so
// both layouts share it.

import { THUMB_MAX, THUMB_MIN } from "../lib/reviewthumb";
import type { BulkScope, Verdict } from "../lib/reviewbulk";
import type { ViewMode } from "./state";

export interface ToolbarProps {
  view: ViewMode;
  thumbH: number;
  selectedCount: number;
  checkedVisible: number;
  visibleCount: number;
  hiddenCount: number;
  autoNext: boolean;
  patch: (p: { view?: ViewMode; autoNext?: boolean }) => void;
  setThumbH: (px: number) => void;
  selectAll: () => void;
  deselectAll: () => void;
  requestBulk: (scope: BulkScope, verdict: Verdict) => void;
}

export default function SelectionToolbar(p: ToolbarProps) {
  return (
    <section className="panel space-y-2" data-testid="sel-toolbar">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ViewToggle p={p} />
        <ZoomSlider p={p} />
        <label className="flex items-center gap-1 text-xs text-slate-400">
          Next pending
          <input
            data-testid="sel-autonext" type="checkbox" className="accent-indigo-500 sel-focus"
            checked={p.autoNext} onChange={(e) => p.patch({ autoNext: e.target.checked })}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SelectControls p={p} />
        <BulkButtons p={p} />
      </div>
    </section>
  );
}

function ViewToggle({ p }: { p: ToolbarProps }) {
  return (
    <span className="flex items-center gap-1" role="group" aria-label="Review layout">
      <button
        data-testid="sel-view-compare" aria-pressed={p.view === "compare"}
        onClick={() => p.patch({ view: "compare" })}
        className={`sel-focus rounded-lg px-3 py-1 text-xs font-semibold ${p.view === "compare" ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
      >
        Comparison view
      </button>
      <button
        data-testid="sel-view-list" aria-pressed={p.view === "list"}
        onClick={() => p.patch({ view: "list" })}
        className={`sel-focus rounded-lg px-3 py-1 text-xs font-semibold ${p.view === "list" ? "bg-indigo-500 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
      >
        List review
      </button>
    </span>
  );
}

function ZoomSlider({ p }: { p: ToolbarProps }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      Thumbnail maximum height
      <span>{THUMB_MIN} px</span>
      <input
        data-testid="sel-thumbzoom" type="range" className="sel-focus w-40 accent-indigo-500"
        min={THUMB_MIN} max={THUMB_MAX} value={p.thumbH}
        aria-label="Thumbnail maximum height" aria-valuetext={`${p.thumbH} px`}
        onChange={(e) => p.setThumbH(Number(e.target.value))}
      />
      <span>{THUMB_MAX} px</span>
      <b className="text-slate-200" data-testid="sel-thumbzoom-value">{p.thumbH} px</b>
    </label>
  );
}

function SelectControls({ p }: { p: ToolbarProps }) {
  return (
    <span className="flex items-center gap-2">
      <button data-testid="sel-select-all" className="btn-ghost" onClick={p.selectAll}>Select all</button>
      <button data-testid="sel-deselect-all" className="btn-ghost" onClick={p.deselectAll}>Deselect all</button>
      <span className="text-xs text-slate-400" data-testid="sel-selected-count">
        Selected: {p.selectedCount}{p.hiddenCount > 0 ? ` (${p.hiddenCount} hidden by filters)` : ""}
      </span>
    </span>
  );
}

function BulkButtons({ p }: { p: ToolbarProps }) {
  return (
    <span className="ml-auto flex flex-wrap items-center gap-2">
      <button
        data-testid="sel-approve-selected" className="btn-primary" disabled={p.checkedVisible === 0}
        onClick={() => p.requestBulk("selected", "approved")}
      >
        ✓ Approve selected
      </button>
      <button
        data-testid="sel-decline-selected" className="btn-ghost" disabled={p.checkedVisible === 0}
        onClick={() => p.requestBulk("selected", "declined")}
      >
        ✕ Decline selected
      </button>
      <button
        data-testid="sel-approve-visible" className="btn-ghost" disabled={p.visibleCount === 0}
        onClick={() => p.requestBulk("visible", "approved")}
      >
        ✓ Approve visible list
      </button>
      <button
        data-testid="sel-decline-visible" className="btn-ghost" disabled={p.visibleCount === 0}
        onClick={() => p.requestBulk("visible", "declined")}
      >
        ✕ Decline visible list
      </button>
    </span>
  );
}
