// ScanTable.tsx — V2 selection: purple active separate from checked, arrow moves active, gestures

import { useCallback, useEffect, useRef, useState } from "react";
import type { Row } from "./useBatch";
import type { SourceStatus } from "../lib/statefile";
import type { RowMods } from "../selectionv2/ReviewList";
import { selectIntent } from "../lib/reviewselect";

export interface ScanTableProps {
  rows: Row[]; thumb: number; activeId: string | null;
  toggle: (relPath: string) => void;
  selectRow: (id: string, intent: ReturnType<typeof selectIntent>) => void;
  copyPath: (relPath: string) => void;
  thumbFor: (relPath: string) => Promise<string>;
}

const BADGE: Record<SourceStatus, { label: string; cls: string }> = {
  unprocessed: { label: "unprocessed", cls: "bg-slate-500/20 text-slate-300" },
  processed: { label: "processed", cls: "bg-emerald-500/20 text-emerald-300" },
  skipped: { label: "skipped", cls: "bg-amber-500/20 text-amber-300" },
  changed: { label: "changed", cls: "bg-sky-500/20 text-sky-300" },
  missing: { label: "missing", cls: "bg-rose-500/20 text-rose-300" },
  deleted: { label: "deleted", cls: "bg-rose-500/20 text-rose-300" },
};

export default function ScanTable(props: ScanTableProps) {
  return (
    <section className="panel w-full" data-testid="scan-table">
      <div className="mb-3 flex flex-wrap items-center gap-2"><h3 className="panel-title !mb-0">Images ({props.rows.length})</h3></div>
      {props.rows.length === 0 ? <p className="rounded-xl border border-white/10 p-6 text-center text-slate-400">No _AI images found in this folder.</p> : <ul className="w-full space-y-1" role="list" aria-label="Batch images" data-testid="batch-rows">{props.rows.map((r) => <RowView key={r.relPath} r={r} {...props} />)}</ul>}
    </section>
  );
}

function RowView({ r, toggle, selectRow, copyPath, thumbFor, thumb, activeId }: { r: Row } & ScanTableProps) {
  const disabled = r.status === "missing" || r.status === "deleted";
  const active = isActive(r.relPath, activeId);
  const ref = useActiveScroll(active);
  const onRowClick = useRowClick(r, disabled, selectRow);
  const onKeyDown = useRowKey(r, disabled, selectRow);
  return (
    <li ref={ref} role="listitem" tabIndex={disabled ? -1 : 0} aria-selected={active} data-testid={`batch-row-${r.relPath}`} className={rowClass(active, r.selected, disabled)} onClick={onRowClick} onKeyDown={onKeyDown}>
      <RowCheck r={r} disabled={disabled} toggle={toggle} />
      <Thumb relPath={r.relPath} thumbFor={thumbFor} thumb={thumb} />
      <RowInfo r={r} />
      <RowBadge status={r.status} />
      <button className="btn-mini" title="Copy path" onClick={(e) => { e.stopPropagation(); copyPath(r.relPath); }} data-testid={`row-open-${r.relPath}`}>Open in File Explorer</button>
    </li>
  );
}

function isActive(relPath: string, activeId: string | null): boolean {
  return activeId !== null && relPath.toLowerCase() === activeId.toLowerCase();
}

function useRowClick(r: Row, disabled: boolean, selectRow: ScanTableProps["selectRow"]) {
  return useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    const t = e.target as HTMLElement;
    if (t.closest('input[type="checkbox"]') || t.closest("button")) return;
    const mods: RowMods = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey };
    selectRow(r.relPath, selectIntent(mods));
  }, [r, disabled, selectRow]);
}

function useRowKey(r: Row, disabled: boolean, selectRow: ScanTableProps["selectRow"]) {
  return useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (disabled) return;
    selectRow(r.relPath, "replace");
  }, [r, disabled, selectRow]);
}

function RowCheck({ r, disabled, toggle }: { r: Row; disabled: boolean; toggle: (rel: string) => void }) {
  return <input type="checkbox" checked={r.selected} disabled={disabled} onChange={() => toggle(r.relPath)} className="h-4 w-4 accent-indigo-500" data-testid={`row-select-${r.relPath}`} aria-label={`Select ${r.name}`} title="Checkbox changes checks only" onClick={(e) => e.stopPropagation()} />;
}

function RowInfo({ r }: { r: Row }) {
  return <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.name}{r.refRelPath === null && <span className="ml-2 text-amber-300" title="Reference image missing">⚠ ref missing</span>}</p><p className="truncate text-xs text-slate-400">{r.relPath}</p></div>;
}

function RowBadge({ status }: { status: SourceStatus }) {
  const b = BADGE[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs ${b.cls}`}>{b.label}</span>;
}

function rowClass(active: boolean, checked: boolean, disabled: boolean): string {
  const base = "batch-row flex items-center gap-3 rounded-lg border px-2 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500";
  const state = disabled ? " opacity-50 cursor-not-allowed border-white/5 bg-white/[0.02]" : " border-white/5 bg-white/[0.03] hover:bg-white/[0.05]";
  return `${base}${state}${checked ? " selected" : ""}${active ? " active" : ""}`;
}

function useActiveScroll(active: boolean) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (!active) return; ref.current?.scrollIntoView({ block: "nearest", behavior: "auto" }); }, [active]);
  return ref;
}

function Thumb({ relPath, thumbFor, thumb }: { relPath: string; thumbFor: (r: string) => Promise<string>; thumb: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { let alive = true; void thumbFor(relPath).then((u) => alive && setSrc(u)).catch(() => {}); return () => { alive = false; }; }, [relPath, thumbFor]);
  const size = Math.max(48, Math.min(800, thumb));
  return src ? <img src={src} alt="" className="rounded-md bg-white object-contain" style={{ height: size, width: size }} /> : <div className="animate-pulse rounded-md bg-white/10" style={{ height: size, width: size }} />;
}

export function useThumbCache(getUrl: (relPath: string) => Promise<string>) {
  const [cache] = useState(() => new Map<string, string>());
  return useCallback((relPath: string) => {
    const hit = cache.get(relPath);
    if (hit) return Promise.resolve(hit);
    return getUrl(relPath).then((u) => { cache.set(relPath, u); return u; });
  }, [cache, getUrl]);
}
