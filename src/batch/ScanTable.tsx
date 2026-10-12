// ScanTable.tsx — Batch folders list, exact same UI design as SVG output (fonts, text size, win header, titles)
// Uses svg-panel, svg-head, svg-columns, svg-row, svg-file-main, svg-cell, svg-badge, etc.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Row } from "./useBatch";
import type { SourceStatus } from "../lib/statefile";
import type { RowMods } from "../selectionv2/ReviewList";
import { selectIntent } from "../lib/reviewselect";
import { fmtDate, fmtTime } from "../selection/fmt";

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
  const missing = props.rows.filter((r) => r.status === "missing" || r.status === "deleted").length;
  const refMissing = props.rows.filter((r) => r.refRelPath === null).length;
  return (
    <div className="svg-panel" data-testid="scan-table">
      <header className="svg-head">
        <div className="svg-title">
          <h1>BATCH FOLDERS / IMAGES</h1>
          <span data-testid="batch-row-count">{props.rows.length}</span>
          <span>one file per pair</span>
        </div>
        <div className="svg-attention">
          <span className="running" data-testid="batch-missing-count">{missing} missing</span>
          <span className="needs" data-testid="batch-refmissing-count">{refMissing} ref missing</span>
        </div>
      </header>
      <div className="pair-table">
        <Columns />
        <div className="svg-rows" role="list" aria-label="Batch images" data-testid="batch-rows">
          {props.rows.length === 0 ? <p className="svg-empty">No _AI images found in this folder.</p> : props.rows.map((r) => <RowView key={r.relPath} r={r} {...props} />)}
        </div>
      </div>
      <footer className="svg-list-footer">
        <span data-testid="batch-footer">Showing {props.rows.length} images</span>
        <span className="svg-hints">↑↓ active row · Space select · A select visible · E deselect · Click row, Shift range, Ctrl toggle</span>
      </footer>
    </div>
  );
}

function Columns() {
  return (
    <div className="svg-columns" aria-hidden="true">
      <span />
      <span>AI Image / Reference</span>
      <span>File / path / persistence</span>
      <span>Generation</span>
      <span>Review</span>
      <span>Version / tokens / cost</span>
      <span>Files / code / history</span>
      <span>Generate / decision</span>
    </div>
  );
}

function RowView({ r, toggle, selectRow, copyPath, thumbFor, thumb, activeId }: { r: Row } & ScanTableProps) {
  const disabled = r.status === "missing" || r.status === "deleted";
  const active = isActive(r.relPath, activeId);
  const checked = r.selected;
  const ref = useActiveScroll(active);
  const onRowClick = useRowClick(r, disabled, selectRow);
  const onKeyDown = useRowKey(r, disabled, selectRow);
  return (
    <div ref={ref} role="listitem" tabIndex={disabled ? -1 : 0} aria-current={active ? "true" : undefined} data-testid={`batch-row-${r.relPath}`} className={`svg-row ${r.status}${active ? " active" : ""}${checked ? " selected" : ""}`} onClick={onRowClick} onKeyDown={onKeyDown}>
      <input type="checkbox" className="svg-check" data-testid={`row-select-${r.relPath}`} checked={checked} disabled={disabled} aria-label={`Select ${r.name}`} title="Checkbox changes checks only" onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.relPath)} />
      <Thumb relPath={r.relPath} thumbFor={thumbFor} thumb={thumb} />
      <FileCell r={r} />
      <StatusCell r={r} />
      <ReviewCell r={r} />
      <UsageCell r={r} />
      <FileActions r={r} copyPath={copyPath} />
      <DecisionCell r={r} />
    </div>
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
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (disabled) return;
      if (e.key === " ") {
        // Space toggles check only (like SVG Space select)
        return;
      }
      selectRow(r.relPath, "replace");
    }
  }, [r, disabled, selectRow]);
}
function useActiveScroll(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (active) ref.current?.scrollIntoView?.({ block: "nearest" }); }, [active]);
  return ref;
}
function FileCell({ r }: { r: Row }) {
  return (
    <div className="svg-file-main">
      <div className="svg-file-name" title={r.name}>{r.name}</div>
      <div className="svg-file-sub" title={r.relPath}>{r.relPath}{r.refRelPath === null ? " · ⚠ ref missing" : ""}</div>
      <div className="svg-persist" title={r.relPath}>{r.status === "missing" ? "Missing" : r.status === "deleted" ? "Deleted" : "Pair file saved"}</div>
    </div>
  );
}
function StatusCell({ r }: { r: Row }) {
  const b = BADGE[r.status];
  return <div className="svg-cell" data-testid={`batch-status-${r.relPath}`}><span className={`svg-badge ${r.status}`}>{b.label}</span></div>;
}
function ReviewCell({ r }: { r: Row }) {
  return <div className="svg-cell"><span className={`svg-badge ${r.status}`}>{r.refRelPath === null ? "Ref missing" : "Complete"}</span></div>;
}
function UsageCell({ r }: { r: Row }) {
  return <div className="svg-cell svg-usage"><strong>{r.name.split(".").pop()?.toUpperCase() ?? "PNG"}</strong><small>{fmtDate(r.mtime)} {fmtTime(r.mtime)}</small><small>{r.status}</small></div>;
}
function FileActions({ r, copyPath }: { r: Row; copyPath: (rel: string) => void }) {
  const click = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return <div className="svg-file-actions"><button type="button" className="svg-btn tiny" data-testid={`row-open-${r.relPath}`} onClick={click(() => copyPath(r.relPath))}>Location</button><button type="button" className="svg-btn tiny" disabled>Copy</button><button type="button" className="svg-btn tiny" disabled>Code</button><button type="button" className="svg-btn tiny" disabled>Versions</button></div>;
}
function DecisionCell({ r }: { r: Row }) {
  return <div className="svg-decision-actions"><span className="svg-badge" data-testid={`batch-decision-${r.relPath}`}>{r.selected ? "Selected" : "—"}</span></div>;
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
