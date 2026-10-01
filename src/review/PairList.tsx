// PairList.tsx — the review list panel (spec §2, §10; design left column):
// title with the pair count, search (⌘K / Ctrl+K), the sort-and-filter summary
// with the "needs attention" figure, the rows and the panel footer.

import { useEffect, useRef } from "react";
import type { Thumbs } from "../ui/useThumbnails";
import Glyph from "../ui/Glyph";
import PairRow from "./PairRow";
import type { ReviewItem } from "../lib/reviewmerge";

export interface PairListProps {
  items: ReviewItem[];
  total: number;
  thumbs: Thumbs;
  selectedId: string | null;
  search: string;
  summary: string;
  attention: number;
  emptyNote: string;
  canClear: boolean;
  collapsed: boolean;
  onSearch: (text: string) => void;
  onOpen: (id: string) => void;
  onToggleCollapse: () => void;
  onClear: () => void;
  onWiden?: () => void;
}

export default function PairList(props: PairListProps) {
  return (
    <section className="panel flex min-h-0 flex-col" data-testid="review-list-panel">
      <Head {...props} />
      {!props.collapsed && <Search {...props} />}
      {!props.collapsed && <Summary {...props} />}
      {!props.collapsed && <Rows {...props} />}
      <Footer {...props} />
    </section>
  );
}

function Head({ total, collapsed, onToggleCollapse, onWiden }: PairListProps) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-slate-300">IMAGE PAIRS</h2>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs tabular-nums text-slate-300">{total}</span>
      <div className="ml-auto flex gap-1">
        <button type="button" data-testid="list-collapse" aria-expanded={!collapsed} aria-label="Collapse list"
          onClick={onToggleCollapse} className="btn-mini px-2 py-1">
          <span aria-hidden="true">{collapsed ? "▾" : "▴"}</span>
        </button>
        {onWiden && (
          <button type="button" data-testid="list-widen" aria-label="Wider list" onClick={onWiden} className="btn-mini px-2 py-1">
            <span aria-hidden="true">⤢</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Search({ search, onSearch }: PairListProps) {
  const input = useRef<HTMLInputElement>(null);
  useSearchHotkey(input, onSearch);
  return (
    <div className="relative mb-2">
      <span className="absolute top-1/2 left-2 -translate-y-1/2 text-slate-500"><Glyph name="search" /></span>
      <input
        ref={input} data-testid="review-search" type="search" value={search} placeholder="Search filename or folder…"
        onChange={(e) => onSearch(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 py-1.5 pl-8 pr-14 text-sm"
      />
      <kbd className="absolute top-1/2 right-2 -translate-y-1/2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">⌘K</kbd>
    </div>
  );
}

/** ⌘K / Ctrl+K focuses the search box; Escape clears it (design hint). */
function useSearchHotkey(input: React.RefObject<HTMLInputElement | null>, onSearch: (text: string) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        return void input.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === input.current) onSearch("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [input, onSearch]);
}

function Summary({ summary, attention }: PairListProps) {
  return (
    <p className="mb-2 flex items-center gap-2 text-[11px] tracking-wide text-slate-500 uppercase" data-testid="review-summary">
      {summary}
      {attention > 0 && (
        <span className="ml-auto normal-case text-amber-300" data-testid="review-attention">
          {attention} need attention
        </span>
      )}
    </p>
  );
}

function Rows({ items, thumbs, selectedId, emptyNote, onOpen }: PairListProps) {
  if (items.length === 0) {
    return (
      <p data-testid="review-empty" className="grid flex-1 place-items-center rounded-xl border border-white/10 p-8 text-center text-sm text-slate-400">
        {emptyNote}
      </p>
    );
  }
  return (
    <ul data-testid="review-list" className="max-h-[30rem] space-y-0.5 overflow-y-auto pr-1">
      {items.map((item) => (
        <PairRow key={item.id} item={item} thumbs={thumbs} selected={selectedId === item.id} onOpen={onOpen} />
      ))}
    </ul>
  );
}

function Footer({ canClear, onClear }: PairListProps) {
  return (
    <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
      <p className="text-[11px] text-slate-500">No matches shows an empty state here</p>
      <button type="button" data-testid="list-clear-filters" className="btn-mini ml-auto" disabled={!canClear} onClick={onClear}>
        CLEAR FILTERS
      </button>
    </div>
  );
}
