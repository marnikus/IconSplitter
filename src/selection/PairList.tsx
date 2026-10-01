// PairList.tsx — review list shared by both layouts (spec §2/§5): header with
// tri-state select-all checkbox, search, rows via PairRow, honest empty
// states. The wide variant fills the List-review layout; the side variant is
// the Comparison sidebar. Same filters, selection, decisions, persistence.

import { useEffect, useRef } from "react";
import type { CheckState } from "../lib/reviewselect";
import type { ViewPair } from "../lib/reviewfilter";
import PairRow, { type ReviewListCtx } from "./PairRow";

export interface PairListProps {
  ctx: ReviewListCtx;
  visible: ViewPair[];
  totalPairs: number;
  attention: number;
  headerState: CheckState;
  search: string;
  setSearch: (s: string) => void;
  onHeaderCheck: () => void;
  patch: (p: { collapsed?: boolean }) => void;
  clearFilters: () => void;
  collapsed: boolean;
}

export default function PairList(p: PairListProps) {
  return (
    <section className={`panel flex flex-col ${p.ctx.variant === "side" ? "h-full" : ""}`} data-testid="sel-list">
      <ListHeader p={p} />
      <SearchBox p={p} />
      {p.collapsed ? null : <ListBody p={p} />}
    </section>
  );
}

function ListHeader({ p }: { p: PairListProps }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <h3 className="panel-title !mb-0">Image pairs <span className="ml-1 rounded-full bg-white/10 px-2 text-xs">{p.totalPairs}</span></h3>
      <HeaderCheck state={p.headerState} onToggle={p.onHeaderCheck} />
      {p.attention > 0 && (
        <span className="text-xs font-semibold text-amber-300" data-testid="sel-attention">
          {p.attention} NEED ATTENTION
        </span>
      )}
      <span className="ml-auto flex gap-1">
        <button className="btn-mini sel-focus" aria-label="Expand list" data-testid="sel-expand" onClick={() => p.patch({ collapsed: false })}>˅</button>
        <button className="btn-mini sel-focus" aria-label="Collapse list" data-testid="sel-collapse" onClick={() => p.patch({ collapsed: true })}>˄</button>
      </span>
    </div>
  );
}

/** Tri-state checkbox over the visible scope (checked / unchecked / mixed). */
function HeaderCheck({ state, onToggle }: { state: CheckState; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-300">
      <input
        ref={ref} data-testid="sel-select-all-check" type="checkbox" className="accent-indigo-500 sel-focus"
        checked={state === "checked"} onChange={onToggle} aria-label="Select all visible pairs"
      />
      Select all
    </label>
  );
}

function SearchBox({ p }: { p: PairListProps }) {
  return (
    <input
      data-testid="sel-search" type="search" value={p.search} placeholder="Search filename or folder…"
      onChange={(e) => p.setSearch(e.target.value)} aria-label="Search filename or folder"
      className="mb-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm focus:outline-2 focus:outline-indigo-400"
    />
  );
}

function ListBody({ p }: { p: PairListProps }) {
  if (p.visible.length === 0) return <EmptyState total={p.totalPairs} clear={p.clearFilters} />;
  return (
    <ul className={`flex-1 space-y-1 overflow-y-auto pr-1 ${p.ctx.variant === "side" ? "max-h-[38rem]" : ""}`} aria-label="Image pairs">
      {p.visible.map((row) => <PairRow key={row.pairId} row={row} ctx={p.ctx} />)}
    </ul>
  );
}

function EmptyState({ total, clear }: { total: number; clear: () => void }) {
  return total === 0
    ? <p className="p-6 text-center text-sm text-slate-400" data-testid="sel-empty">No images found in this folder.</p>
    : (
      <div className="p-6 text-center text-sm text-slate-400">
        No matches for the current filters.
        <button className="btn-mini ml-2 sel-focus" data-testid="sel-clear-empty" onClick={clear}>CLEAR FILTERS</button>
      </div>
    );
}
