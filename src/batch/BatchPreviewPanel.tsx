// BatchPreviewPanel.tsx — per-selected-row icon count + horizontal thumb strip
// Virtualized: only visible rows rendered (O(visible)), thumbs limited to 20.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Row } from "./useBatch";
import type { PreviewEntry } from "./useBatchPreview";

export interface BatchPreviewPanelProps {
  selectedRows: Row[];
  previews: Map<string, PreviewEntry>;
  onClear?: () => void;
}

const ROW_H = 120;
const OVERSCAN = 5;

function CountBadge({ entry }: { entry: PreviewEntry }) {
  return (
    <span className="text-xs font-medium text-slate-300" data-testid={`batch-preview-count-${entry.relPath}`}>
      {entry.count} icon{entry.count === 1 ? "" : "s"}
      {entry.thumbs.length < entry.count ? ` (+${entry.count - entry.thumbs.length} more)` : ""}
    </span>
  );
}

function ThumbStrip({ entry }: { entry: PreviewEntry }) {
  return (
    <div className="flex gap-2 overflow-x-auto py-1" data-testid={`batch-preview-strip-${entry.relPath}`}>
      {entry.status === "loading" && <span className="text-xs text-slate-500">Loading…</span>}
      {entry.status === "error" && <span className="text-xs text-rose-400">Preview failed</span>}
      {entry.thumbs.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          className="h-16 w-16 rounded border border-white/10 bg-white object-contain"
          data-testid={`batch-preview-thumb-${entry.relPath}-${i}`}
          style={{ flex: "none" }}
        />
      ))}
      {entry.thumbs.length === 0 && entry.status === "done" && entry.count > 0 && (
        <span className="text-xs text-slate-500">No thumbnails (count {entry.count})</span>
      )}
    </div>
  );
}

function PreviewRow({ row, entry }: { row: Row; entry: PreviewEntry }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3" data-testid={`batch-preview-row-${row.relPath}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium" title={row.relPath}>
          {row.name}
        </span>
        <CountBadge entry={entry} />
      </div>
      <div className="truncate text-[11px] text-slate-500">{row.relPath}</div>
      <ThumbStrip entry={entry} />
    </div>
  );
}

function useVirtualSlice(total: number, ref: React.RefObject<HTMLDivElement | null>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    el.addEventListener("scroll", onScroll, { passive: true });
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [ref]);
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visible = Math.ceil(height / ROW_H) + OVERSCAN * 2;
  const end = Math.min(total, start + visible);
  return { start, end, offset: start * ROW_H, totalH: total * ROW_H };
}

function Header({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="panel-title !mb-0">Preview splits — {count} image{count === 1 ? "" : "s"}</h3>
      <button type="button" className="btn-ghost text-xs" data-testid="batch-preview-clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

function List({ rows, previews, start, end, offset, totalH }: { rows: Row[]; previews: Map<string, PreviewEntry>; start: number; end: number; offset: number; totalH: number }) {
  const slice = useMemo(() => rows.slice(start, end), [rows, start, end]);
  return (
    <div style={{ height: totalH, position: "relative" }}>
      <div style={{ transform: `translateY(${offset}px)`, display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
        {slice.map((row) => {
          const entry = previews.get(row.relPath) ?? { relPath: row.relPath, count: 0, thumbs: [], boxes: [], status: "idle" as const };
          return <PreviewRow key={row.relPath} row={row} entry={entry} />;
        })}
      </div>
    </div>
  );
}

export default function BatchPreviewPanel({ selectedRows, previews, onClear }: BatchPreviewPanelProps) {
  const eligible = useMemo(() => selectedRows.filter((r) => r.status !== "missing" && r.status !== "deleted"), [selectedRows]);
  const containerRef = useRef<HTMLDivElement>(null);
  const { start, end, offset, totalH } = useVirtualSlice(eligible.length, containerRef);
  const clear = useCallback(() => onClear?.(), [onClear]);
  if (eligible.length === 0) return null;
  return (
    <section className="panel space-y-3" data-testid="batch-preview-panel">
      <Header count={eligible.length} onClear={clear} />
      <div ref={containerRef} className="max-h-[500px] overflow-auto rounded-xl border border-white/10" style={{ height: 400 }}>
        <List rows={eligible} previews={previews} start={start} end={end} offset={offset} totalH={totalH} />
      </div>
      <p className="text-[11px] text-slate-500">Previews use current merge and export settings. No files written.</p>
    </section>
  );
}
