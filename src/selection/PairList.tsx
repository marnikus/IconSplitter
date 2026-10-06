// PairList.tsx — scrollable review list (spec §2): thumbnail, filename,
// relative folder, creation date, status chip with text + glyph (a11y §11),
// search, collapse and honest empty states (spec §10).

import { useEffect, useState } from "react";
import { attentionInfo, type ReviewPair } from "../lib/pairing";
import { statusInfo } from "../lib/reviewmeta";
import type { ViewPair } from "../lib/reviewfilter";
import { fmtShort } from "./fmt";
import type { ThumbFor } from "./thumbs";

export interface PairListProps {
  visible: ViewPair[];
  totalPairs: number;
  attention: number;
  selectedId: string | null;
  collapsed: boolean;
  search: string;
  select: (id: string) => void;
  setSearch: (s: string) => void;
  patch: (p: { collapsed?: boolean }) => void;
  clearFilters: () => void;
  thumbFor: ThumbFor;
}

export default function PairList(p: PairListProps) {
  return (
    <section className="panel flex h-full flex-col" data-testid="sel-list">
      <ListHeader p={p} />
      <input
        data-testid="sel-search" type="search" value={p.search} placeholder="Search filename or folder…"
        onChange={(e) => p.setSearch(e.target.value)} aria-label="Search filename or folder"
        className="mb-2 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-sm focus:outline-2 focus:outline-indigo-400"
      />
      {p.collapsed ? null : <ListBody p={p} />}
    </section>
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

function Row({ row, p }: { row: ViewPair; p: PairListProps }) {
  const active = row.pairId === p.selectedId;
  const warn = attentionInfo(row);
  const meta = statusInfo(row.decision);
  const label = `${row.base} in ${row.relDir || "root"} — ${warn ?? meta.label}`;
  return (
    <li>
      <button
        data-testid={`sel-row-${row.pairId}`} onClick={() => p.select(row.pairId)} aria-label={label}
        aria-current={active}
        className={`sel-focus flex w-full items-center gap-3 rounded-xl border px-2 py-1.5 text-left ${
          active ? "border-indigo-400 bg-indigo-500/15" : "border-white/5 bg-white/[0.03] hover:bg-white/[0.07]"}`}
      >
        <Thumb row={row} thumbFor={p.thumbFor} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{displayName(row)}</span>
          <span className="block truncate text-xs text-slate-400">{row.relDir || "/"}</span>
          <span className="block text-[10px] text-slate-500">{fmtShort(row.created)}</span>
        </span>
        <Chip row={row} warn={warn} />
      </button>
    </li>
  );
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

function Thumb({ row, thumbFor }: { row: ViewPair; thumbFor: ThumbFor }) {
  const [src, setSrc] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let alive = true;
    setSrc(null);
    setBad(false);
    thumbFor(row).then((u) => { if (alive) setSrc(u); }).catch(() => alive && setBad(true));
    return () => { alive = false; };
  }, [row, thumbFor]);
  if (bad) return <span className="grid h-10 w-10 place-items-center rounded-md border border-amber-400/40 text-amber-300" title="Thumbnail failed">⚠</span>;
  return src
    ? <img src={src} alt="" className="h-10 w-10 rounded-md bg-white object-cover" />
    : <span className="h-10 w-10 animate-pulse rounded-md bg-white/10" />;
}
