// CompareView.tsx — side-by-side Original / AI result (spec §5): consistent
// non-stretched dimensions, labels, dims/format/size/path meta, Open-in-
// Explorer fallback per side, Approve/Decline + next-pending, 1:1/SYNC zoom.

import { useEffect, useRef, useState } from "react";
import type { DirHandleLike } from "../lib/fs";
import { attentionInfo, type SideRef } from "../lib/pairing";
import { statusInfo } from "../lib/reviewmeta";
import type { ViewPair } from "../lib/reviewfilter";
import { fmtBytes, fmtFormat, fmtLong } from "./fmt";
import { fullPathText } from "./handles";
import { sideUrl } from "./thumbs";

export interface CompareProps {
  pair: ViewPair | null;
  rootName: string;
  rootRef: { current: DirHandleLike | null };
  zoom: "fit" | "full";
  sync: boolean;
  patch: (p: { zoom?: "fit" | "full"; sync?: boolean }) => void;
  decide: (id: string, d: "approved" | "declined") => void;
  copyPath: (relPath: string) => void;
}

export default function CompareView(p: CompareProps) {
  const left = useRef<HTMLDivElement | null>(null);
  const right = useRef<HTMLDivElement | null>(null);
  if (!p.pair) return <p className="panel p-8 text-center text-sm text-slate-400">Select a pair to compare.</p>;
  const pair = p.pair;
  const meta = statusInfo(pair.decision);
  return (
    <section className="panel space-y-3" data-testid="sel-compare">
      <Header pair={pair} meta={meta} p={p} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Pane title="Original" side={pair.source} missing="AI result present but original is missing" p={p} boxRef={left} other={right} />
        <Pane title="AI result" side={pair.ai} missing="No AI result for this original" p={p} boxRef={right} other={left} />
      </div>
      <Discovery pair={pair} />
    </section>
  );
}

function Header({ pair, meta, p }: { pair: ViewPair; meta: ReturnType<typeof statusInfo>; p: CompareProps }) {
  const warn = attentionInfo(pair);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold">{pair.base}
          <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs" data-testid="sel-status">{meta.glyph} {warn ?? meta.label}</span>
        </h3>
        <p className="truncate font-mono text-xs text-slate-400">{pair.pairId} · {pair.relDir || "/"}</p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button data-testid="sel-zoom" onClick={() => p.patch({ zoom: p.zoom === "fit" ? "full" : "fit" })}
          className={`rounded-lg px-2 py-1 text-xs font-semibold ${p.zoom === "full" ? "bg-indigo-500 text-white" : "bg-white/10 text-slate-300"}`}
          title="Space toggles fit / 100%">1:1</button>
        <label className="flex items-center gap-1 text-xs text-slate-400">SYNC
          <input data-testid="sel-sync" type="checkbox" className="accent-indigo-500" checked={p.sync} onChange={(e) => p.patch({ sync: e.target.checked })} />
        </label>
        <button data-testid="sel-decline" className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-1.5 text-sm font-semibold text-rose-300 hover:bg-rose-500/25 sel-focus"
          onClick={() => p.decide(pair.pairId, "declined")}>✕ Decline</button>
        <button data-testid="sel-approve" className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-1.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/25 sel-focus"
          onClick={() => p.decide(pair.pairId, "approved")}>✓ Approve</button>
      </div>
    </div>
  );
}

interface PaneProps {
  title: "Original" | "AI result";
  side: SideRef | null;
  missing: string;
  p: CompareProps;
  boxRef: { current: HTMLDivElement | null };
  other: { current: HTMLDivElement | null };
}

function Pane({ title, side, missing, p, boxRef, other }: PaneProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <b className="text-sm">{title}</b>
        {side && (
          <button className="btn-mini sel-focus" data-testid={`sel-open-${title === "Original" ? "src" : "ai"}`}
            onClick={() => p.copyPath(side.relPath)}>Open in File Explorer</button>
        )}
      </div>
      <PaneBody title={title} side={side} missing={missing} p={p} boxRef={boxRef} other={other} />
    </div>
  );
}

function usePaneImage(side: SideRef | null, p: CompareProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null); setBad(false); setDims(null);
    if (!side) return;
    sideUrl(p.rootRef, side.relPath)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => alive && setBad(true));
    return () => { alive = false; };
  }, [side, p.rootRef]);
  const onDims = (e: React.SyntheticEvent<HTMLImageElement>) =>
    setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
  return { url, bad, dims, onDims };
}

function PaneBody({ title, side, missing, p, boxRef, other }: PaneProps) {
  const img = usePaneImage(side, p);
  if (!side) return <MissingNote text={missing} />;
  if (img.bad) return <MissingNote text="Thumbnail failed — the file could not be decoded." />;
  const full = p.zoom === "full";
  return (
    <>
      <PaneScroll boxRef={boxRef} other={other} full={full} url={img.url} title={title} sync={p.sync} onDims={img.onDims} />
      <MetaRow side={side} rootName={p.rootName} dims={img.dims} />
    </>
  );
}

function PaneScroll({ boxRef, other, full, url, title, sync, onDims }: {
  boxRef: PaneProps["boxRef"]; other: PaneProps["other"]; full: boolean;
  url: string | null; title: string; sync: boolean;
  onDims: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  return (
    <div
      ref={(el) => { boxRef.current = el; }}
      onScroll={() => mirror(boxRef, other, sync && full)}
      className={`grid place-items-center overflow-auto bg-slate-950 ${full ? "" : "h-80"}`}
    >
      {url && (
        <img
          src={url} alt={`${title} preview`} onLoad={onDims}
          className={full ? "max-w-none" : "max-h-80 w-full object-contain"}
        />
      )}
    </div>
  );
}

function MetaRow({ side, rootName, dims }: { side: SideRef; rootName: string; dims: { w: number; h: number } | null }) {
  return (
    <p className="flex flex-wrap justify-between gap-2 px-3 py-2 font-mono text-[10px] text-slate-400">
      <span className="truncate">{side.relPath.split("/").pop()}</span>
      <span>{dims ? `${dims.w} × ${dims.h} · ` : ""}{fmtFormat(side.relPath)} · {fmtBytes(side.size)} · {fullPathText(rootName, side.relPath)}</span>
    </p>
  );
}

function mirror(a: { current: HTMLDivElement | null }, b: { current: HTMLDivElement | null }, on: boolean): void {
  if (!on || !a.current || !b.current) return;
  b.current.scrollTop = a.current.scrollTop;
  b.current.scrollLeft = a.current.scrollLeft;
}

function MissingNote({ text }: { text: string }) {
  return <p className="grid h-80 place-items-center p-6 text-center text-sm text-amber-300" data-testid="sel-missing">⚠ {text}</p>;
}

function Discovery({ pair }: { pair: ViewPair }) {
  return (
    <p className="text-xs text-slate-400" data-testid="sel-discovery">
      Created {fmtLong(pair.created)}{pair.generated !== null ? ` · Generated ${fmtLong(pair.generated)}` : " · Generated —"}
      <span className="ml-3 text-slate-500">Matched by suffix: _AI · source hierarchy preserved</span>
    </p>
  );
}
