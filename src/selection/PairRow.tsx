// PairRow.tsx — one review row (spec §3): checkbox, BOTH labelled thumbnails
// (aspect preserved, height from the zoom slider, never upscaled past source),
// filename/folder/date/dimensions, status chips (text + glyph, a11y §11) and
// per-row actions in the wide List-review layout.

import { useEffect, useRef, useState } from "react";
import { attentionInfo, type ReviewPair, type SideRef } from "../lib/pairing";
import { statusInfo } from "../lib/reviewmeta";
import type { Decision, ViewPair } from "../lib/reviewfilter";
import { thumbBox, type ThumbBox } from "../lib/reviewthumb";
import { fmtShort } from "./fmt";
import type { UrlFor } from "./thumbs";

/** Shared context for every row of one review list (domain object, RULE 3). */
export interface ReviewListCtx {
  variant: "side" | "wide";
  thumbH: number;
  checked: string[];
  activeId: string | null;
  urlFor: UrlFor;
  activate: (id: string) => void;
  toggleCheck: (id: string) => void;
  decide: (id: string, d: Decision) => void;
  copyPath: (relPath: string) => void;
}

export interface PairRowProps {
  row: ViewPair;
  ctx: ReviewListCtx;
}

export default function PairRow(p: PairRowProps) {
  const warn = attentionInfo(p.row);
  const active = p.ctx.activeId === p.row.pairId;
  const checked = p.ctx.checked.includes(p.row.pairId);
  const liRef = useScrollToActive(active);
  return (
    <li ref={liRef} data-testid={`sel-row-${p.row.pairId}`} className={rowClass(active, checked)}
      style={{ minHeight: p.ctx.thumbH + 16 }}>
      <Check p={p} checked={checked} />
      <RowMain p={p} active={active} warn={warn} />
      {p.ctx.variant === "wide" && <Actions p={p} />}
    </li>
  );
}

/** Active row stays visible during keyboard navigation (spec §7). */
function useScrollToActive(active: boolean): { current: HTMLLIElement | null } {
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return ref;
}

function rowClass(active: boolean, checked: boolean): string {
  const base = "flex items-center gap-2 rounded-xl border px-2 py-1.5";
  if (active) return `${base} border-indigo-400 bg-indigo-500/15 ring-2 ring-indigo-400/40`;
  if (checked) return `${base} border-sky-400/40 bg-sky-500/10`;
  return `${base} border-white/5 bg-white/[0.03] hover:bg-white/[0.07]`;
}

function Check({ p, checked }: { p: PairRowProps; checked: boolean }) {
  return (
    <input
      type="checkbox" data-testid={`sel-check-${p.row.pairId}`} checked={checked}
      onChange={() => p.ctx.toggleCheck(p.row.pairId)}
      aria-label={`Select ${p.row.base}`} className="accent-indigo-500 sel-focus"
    />
  );
}

function RowMain({ p, active, warn }: { p: PairRowProps; active: boolean; warn: string | null }) {
  return (
    <button
      data-testid={`sel-row-main-${p.row.pairId}`} aria-current={active} aria-label={rowLabel(p.row, warn)}
      onClick={() => p.ctx.activate(p.row.pairId)}
      className="sel-focus flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left"
    >
      <Thumbs p={p} />
      <Meta p={p} />
      <Chips row={p.row} warn={warn} />
    </button>
  );
}

function rowLabel(row: ViewPair, warn: string | null): string {
  const meta = statusInfo(row.decision);
  return `${row.base} in ${row.relDir || "root"} — ${warn ?? meta.label}`;
}

function Thumbs({ p }: { p: PairRowProps }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <SideThumb label="Original" side={p.row.source} ctx={p.ctx} />
      <SideThumb label="AI result" side={p.row.ai} ctx={p.ctx} />
    </span>
  );
}

function SideThumb({ label, side, ctx }: { label: string; side: SideRef | null; ctx: ReviewListCtx }) {
  const [url, setUrl] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [dims, setDims] = useState<ThumbBox | null>(null);
  const { urlFor, thumbH, variant } = ctx;
  useEffect(() => {
    let alive = true;
    setUrl(null); setBad(false); setDims(null);
    if (!side) return;
    urlFor(side.relPath).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setBad(true); });
    return () => { alive = false; };
  }, [side, urlFor]);
  const box = thumbBox(dims, thumbH);
  return (
    <figure className="flex flex-col items-center gap-0.5">
      <ThumbBody label={label} box={box} url={url} bad={bad} hasFile={side !== null} onDims={setDims} />
      <figcaption className="text-[10px] text-slate-400">{caption(label, dims, variant)}</figcaption>
    </figure>
  );
}

function ThumbBody({ label, box, url, bad, hasFile, onDims }: {
  label: string; box: ThumbBox; url: string | null; bad: boolean;
  hasFile: boolean; onDims: (d: ThumbBox) => void;
}) {
  const style = { width: box.w, height: box.h };
  if (!hasFile) {
    return (
      <span style={style} className="grid place-items-center rounded-md border border-dashed border-amber-400/40 text-[9px] text-amber-300">
        missing
      </span>
    );
  }
  if (bad) {
    return (
      <span style={style} title="Thumbnail failed" className="grid place-items-center rounded-md border border-amber-400/40 text-amber-300">⚠</span>
    );
  }
  if (!url) return <span style={style} className="animate-pulse rounded-md bg-white/10" />;
  return (
    <img
      src={url} alt={`${label} thumbnail`} style={style} className="rounded-md bg-white object-contain"
      onLoad={(e) => onDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
    />
  );
}

function caption(label: string, dims: ThumbBox | null, variant: "side" | "wide"): string {
  return variant === "wide" && dims ? `${label} · ${dims.w}×${dims.h}` : label;
}

function Meta({ p }: { p: PairRowProps }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{displayName(p.row)}</span>
      <span className="block truncate text-xs text-slate-400">{p.row.relDir || "/"}</span>
      <span className="block text-[10px] text-slate-500">{fmtShort(p.row.created)}</span>
    </span>
  );
}

function displayName(row: ReviewPair): string {
  return (row.source ?? row.ai)?.relPath.split("/").pop() ?? row.base;
}

function Chips({ row, warn }: { row: ViewPair; warn: string | null }) {
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <StatusChip row={row} />
      {warn && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">⚠ {warn}</span>}
    </span>
  );
}

function StatusChip({ row }: { row: ViewPair }) {
  const meta = statusInfo(row.decision);
  const tone = meta.tone === "ok"
    ? "bg-emerald-500/20 text-emerald-300"
    : meta.tone === "bad" ? "bg-rose-500/20 text-rose-300" : "bg-slate-500/20 text-slate-300";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{meta.glyph} {meta.label}</span>;
}

function Actions({ p }: { p: PairRowProps }) {
  const { row, ctx } = p;
  const src = row.source;
  const ai = row.ai;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button data-testid={`sel-row-approve-${row.pairId}`} aria-label={`Approve ${row.base}`}
        className="btn-mini sel-focus" onClick={() => ctx.decide(row.pairId, "approved")}>✓</button>
      <button data-testid={`sel-row-decline-${row.pairId}`} aria-label={`Decline ${row.base}`}
        className="btn-mini sel-focus" onClick={() => ctx.decide(row.pairId, "declined")}>✕</button>
      {src && (
        <button data-testid={`sel-row-opensrc-${row.pairId}`} aria-label={`Open in File Explorer: ${src.relPath}`}
          className="btn-mini sel-focus" onClick={() => ctx.copyPath(src.relPath)}>📁 src</button>
      )}
      {ai && (
        <button data-testid={`sel-row-openai-${row.pairId}`} aria-label={`Open in File Explorer: ${ai.relPath}`}
          className="btn-mini sel-focus" onClick={() => ctx.copyPath(ai.relPath)}>📁 AI</button>
      )}
    </span>
  );
}
