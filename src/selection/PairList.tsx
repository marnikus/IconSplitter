// PairList.tsx — scrollable review list (spec §2/§3/§4): two labelled
// thumbnails per row (Original + AI), checkbox multi-select, status-tinted
// rows with text+glyph chips, active row highlighted AND scrolled into view.

import { useEffect, useState } from "react";
import { attentionInfo, type ReviewPair, type SideRef } from "../lib/pairing";
import { statusInfo } from "../lib/reviewmeta";
import type { ViewPair } from "../lib/reviewfilter";
import { fmtShort } from "./fmt";
import type { ThumbFor } from "./thumbs";

export interface PairListProps {
  visible: ViewPair[];
  totalPairs: number;
  attention: number;
  selectedId: string | null;
  selectedIds: string[];
  thumbSize: "sm" | "lg";
  collapsed: boolean;
  search: string;
  select: (id: string) => void;
  setSearch: (s: string) => void;
  toggle: (id: string) => void;
  patch: (p: { collapsed?: boolean }) => void;
  clearFilters: () => void;
  thumbFor: ThumbFor;
}

export default function PairList(p: PairListProps) {
  return (
    <section className="panel flex h-full flex-col" data-testid="sel-list">
      <ListHeader p={p} />
      <SearchBox p={p} />
      {p.collapsed ? null : <ListBody p={p} />}
    </section>
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

function ListHeader({ p }: { p: PairListProps }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="panel-title !mb-0">Image pairs <span className="ml-1 rounded-full bg-white/10 px-2 text-xs">{p.totalPairs}</span></h3>
      {p.attention > 0 && <span className="text-xs font-semibold text-amber-300" data-testid="sel-attention">{p.attention} NEED ATTENTION</span>}
      <span className="ml-auto flex gap-1">
        <button className="btn-mini sel-focus" aria-label="Expand list" data-testid="sel-expand" onClick={() => p.patch({ collapsed: false })}>˅</button>
        <button className="btn-mini sel-focus" aria-label="Collapse list" data-testid="sel-collapse" onClick={() => p.patch({ collapsed: true })}>˄</button>
      </span>
    </div>
  );
}

function ListBody({ p }: { p: PairListProps }) {
  if (p.visible.length === 0) return <EmptyState total={p.totalPairs} clear={p.clearFilters} />;
  return (
    <ul className="max-h-[38rem] flex-1 space-y-1 overflow-y-auto pr-1" role="listbox" aria-label="Image pairs">
      {p.visible.map((row) => <Row key={row.pairId} row={row} p={p} />)}
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

const TINT: Record<ViewPair["decision"], string> = {
  pending: "bg-white/[0.03]",
  approved: "bg-emerald-500/10",
  declined: "bg-rose-500/10",
};

function Row({ row, p }: { row: ViewPair; p: PairListProps }) {
  const active = row.pairId === p.selectedId;
  const warn = attentionInfo(row);
  const meta = statusInfo(row.decision);
  const checked = p.selectedIds.includes(row.pairId);
  const ref = active ? scrollIntoView : undefined;
  return (
    <li ref={ref} className="flex items-center gap-2">
      <input
        type="checkbox" checked={checked} onChange={() => p.toggle(row.pairId)}
        className="h-4 w-4 shrink-0 accent-indigo-500" data-testid={`sel-check-${row.pairId}`}
        aria-label={`Select ${row.base}`}
      />
      <PairThumbs row={row} p={p} />
      <button
        data-testid={`sel-row-${row.pairId}`} onClick={() => p.select(row.pairId)}
        aria-current={active}
        aria-label={`${row.base} in ${row.relDir || "root"} — ${warn ?? meta.label}`}
        className={`sel-focus flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2 py-1.5 text-left ${
          active ? "border-indigo-400 ring-2 ring-indigo-400/60" : "border-white/5 hover:bg-white/[0.07]"} ${TINT[row.decision]}`}
      >
        <RowText row={row} />
        <Chip row={row} warn={warn} />
      </button>
    </li>
  );
}

function RowText({ row }: { row: ViewPair }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{displayName(row)}</span>
      <span className="block truncate text-xs text-slate-400">{row.relDir || "/"}</span>
      <span className="block text-[10px] text-slate-500">{fmtShort(row.created)}</span>
    </span>
  );
}

function scrollIntoView(el: HTMLElement | null): void {
  el?.scrollIntoView({ block: "nearest" });
}

function displayName(row: ReviewPair): string {
  return (row.source ?? row.ai)?.relPath.split("/").pop() ?? row.base;
}

function Chip({ row, warn }: { row: ViewPair; warn: string | null }) {
  const meta = statusInfo(row.decision);
  if (warn) return <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">⚠ {warn}</span>;
  const tone = meta.tone === "ok" ? "bg-emerald-500/20 text-emerald-300" : meta.tone === "bad" ? "bg-rose-500/20 text-rose-300" : "bg-slate-500/20 text-slate-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{meta.glyph} {meta.label}</span>;
}

/** Two labelled thumbnails: Original (O) and AI result (A), spec §4. */
function PairThumbs({ row, p }: { row: ViewPair; p: PairListProps }) {
  const cls = p.thumbSize === "sm" ? "h-10 w-10" : "h-16 w-16";
  return (
    <span className="flex shrink-0 gap-1">
      <SideThumb side={row.source} label="O" title="Original — open preview" cls={cls}
        testid={`sel-thumb-src-${row.pairId}`} row={row} p={p} />
      <SideThumb side={row.ai} label="A" title="AI result — open preview" cls={cls}
        testid={`sel-thumb-ai-${row.pairId}`} row={row} p={p} />
    </span>
  );
}

function SideThumb({ side, label, title, cls, testid, row, p }: {
  side: SideRef | null; label: string; title: string; cls: string;
  testid: string; row: ViewPair; p: PairListProps;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setBad(false);
    if (!side) return;
    p.thumbFor({ ...row, source: side, ai: side })
      .then((u) => { if (alive) setSrc(u); })
      .catch(() => alive && setBad(true));
    return () => { alive = false; };
  }, [row, side, p]);
  return (
    <button type="button" data-testid={testid} title={title} aria-label={title}
      className={`sel-focus relative block shrink-0 overflow-hidden rounded-md border border-white/10 ${cls}`}
      onClick={() => p.select(row.pairId)}
    >
      <ThumbFace side={side} bad={bad} src={src} title={title} />
      <span className="absolute bottom-0 right-0 rounded-tl bg-slate-900/80 px-0.5 text-[8px] text-slate-300">{label}</span>
    </button>
  );
}

function ThumbFace({ side, bad, src, title }: { side: SideRef | null; bad: boolean; src: string | null; title: string }) {
  if (side === null || bad) {
    return <span className="grid h-full w-full place-items-center bg-amber-500/10 text-amber-300">⚠</span>;
  }
  if (src) return <img src={src} alt={title} className="h-full w-full bg-white object-contain" />;
  return <span className="block h-full w-full animate-pulse bg-white/10" />;
}
