// ScanTable.tsx — Batch folders list, same row preview + per-row merge override

import { useCallback, useEffect, useRef } from "react";
import type { Row, RowMergeMap } from "./useBatch";
import type { RowMods } from "../selectionv2/ReviewList";
import { selectIntent } from "../lib/reviewselect";
import { fmtDate, fmtTime } from "../selection/fmt";
import ScanThumb, { useThumbCache } from "./ScanThumb";
import ScanFileCell from "./ScanFileCell";
import ScanStatusCell from "./ScanStatusCell";
import type { PreviewEntry } from "./useBatchPreview";
import BatchRowMergeBar from "./BatchRowMergeBar";

export interface ScanTableProps {
  rows: Row[];
  thumb: number;
  activeId: string | null;
  toggle: (relPath: string) => void;
  selectRow: (id: string, intent: ReturnType<typeof selectIntent>) => void;
  selectActive: (id: string) => void;
  copyPath: (relPath: string) => void;
  thumbFor: (relPath: string) => Promise<string>;
  previews?: Map<string, PreviewEntry>;
  rowMerges?: RowMergeMap;
  globalFrac?: number | null;
  setRowMerge?: (relPath: string, v: number | null) => void;
  clearRowMerge?: (relPath: string) => void;
}

export { useThumbCache };

function Header({ rows }: { rows: Row[] }) {
  const missing = rows.filter((r) => r.status === "missing" || r.status === "deleted").length;
  const refMissing = rows.filter((r) => r.refRelPath === null).length;
  return (
    <header className="svg-head">
      <div className="svg-title">
        <h1>BATCH FOLDERS / IMAGES</h1>
        <span data-testid="batch-row-count">{rows.length}</span>
        <span>one file per pair</span>
      </div>
      <div className="svg-attention">
        <span className="running" data-testid="batch-missing-count">
          {missing} missing
        </span>
        <span className="needs" data-testid="batch-refmissing-count">
          {refMissing} ref missing
        </span>
      </div>
    </header>
  );
}

function Columns() {
  return (
    <div className="svg-columns batch-columns" aria-hidden="true">
      <span />
      <span>AI Image</span>
      <span>File / path</span>
      <span>Detection</span>
      <span>Preview splits</span>
      <span>Created</span>
      <span>Status</span>
      <span>Open</span>
    </div>
  );
}

function Footer({ count }: { count: number }) {
  return (
    <footer className="svg-list-footer">
      <span data-testid="batch-footer">Showing {count} images</span>
      <span className="svg-hints">↑↓ active row · E select active · Q deselect active · Click = active only · Checkbox = select · Shift range · Ctrl toggle</span>
    </footer>
  );
}

function CheckCell({ r, toggle }: { r: Row; toggle: (rel: string) => void }) {
  const disabled = r.status === "missing" || r.status === "deleted";
  return (
    <input
      type="checkbox"
      className="svg-check"
      data-testid={`row-select-${r.relPath}`}
      checked={r.selected}
      disabled={disabled}
      aria-label={`Select ${r.name}`}
      title="Checkbox changes checks only"
      onClick={(e) => e.stopPropagation()}
      onChange={() => toggle(r.relPath)}
    />
  );
}

function DateCell({ mtime }: { mtime: number }) {
  return (
    <div className="svg-cell">
      <span>{fmtDate(mtime)}</span>
      <small>{fmtTime(mtime)} local</small>
    </div>
  );
}

function OpenCell({ r, copyPath }: { r: Row; copyPath: (rel: string) => void }) {
  return (
    <div className="svg-file-actions">
      <button
        type="button"
        className="svg-btn tiny"
        data-testid={`row-open-${r.relPath}`}
        onClick={(e) => {
          e.stopPropagation();
          copyPath(r.relPath);
        }}
      >
        Open in File Explorer
      </button>
    </div>
  );
}

function PreviewCell({ entry }: { entry: PreviewEntry | undefined }) {
  if (!entry) return <div className="svg-cell min-w-0 w-full text-xs text-slate-500">—</div>;
  if (entry.status === "loading") {
    return <div className="svg-cell min-w-0 w-full text-xs text-slate-400" data-testid={`batch-preview-count-${entry.relPath}`}>Loading…</div>;
  }
  if (entry.status === "error") {
    return <div className="svg-cell min-w-0 w-full text-xs text-rose-400" data-testid={`batch-preview-count-${entry.relPath}`}>Failed</div>;
  }
  return (
    <div className="flex min-w-0 w-full flex-col gap-1">
      <span className="text-xs font-medium text-slate-300" data-testid={`batch-preview-count-${entry.relPath}`}>
        {entry.count} icon{entry.count === 1 ? "" : "s"}
      </span>
      <div className="flex min-w-0 w-full flex-wrap gap-1.5 py-1" data-testid={`batch-preview-strip-${entry.relPath}`}>
        {entry.thumbs.map((src, i) => (
          <img key={i} src={src} alt="" className="h-12 w-12 rounded border border-white/10 bg-white object-contain" data-testid={`batch-preview-thumb-${entry.relPath}-${i}`} style={{ flex: "none" }} />
        ))}
        {entry.thumbs.length === 0 && entry.count > 0 && <span className="text-[11px] text-slate-500">count {entry.count}</span>}
      </div>
    </div>
  );
}

function RowMergeCell({ r, globalFrac, rowMerges, setRowMerge, clearRowMerge }: { r: Row; globalFrac: number | null; rowMerges: RowMergeMap; setRowMerge?: ScanTableProps["setRowMerge"]; clearRowMerge?: ScanTableProps["clearRowMerge"] }) {
  if (r.status === "missing" || r.status === "deleted") return <div className="svg-cell min-w-0 w-full text-xs text-slate-500">—</div>;
  const key = r.relPath.toLowerCase();
  const hasOv = Object.prototype.hasOwnProperty.call(rowMerges, key);
  const ov = hasOv ? rowMerges[key] : undefined;
  return (
    <div className="min-w-0 w-full">
      <BatchRowMergeBar relPath={r.relPath} globalFrac={globalFrac} overrideFrac={ov} onApply={(rp, v) => setRowMerge?.(rp, v as number | null)} onReset={(rp) => clearRowMerge?.(rp)} />
    </div>
  );
}

function RowView({ r, toggle, selectRow, selectActive, copyPath, thumbFor, thumb, activeId, previews, rowMerges, globalFrac, setRowMerge, clearRowMerge }: { r: Row } & ScanTableProps) {
  const disabled = r.status === "missing" || r.status === "deleted";
  const active = isActive(r.relPath, activeId);
  const ref = useActiveScroll(active);
  const onRowClick = useRowClick(r, disabled, selectRow, selectActive);
  const onKeyDown = useRowKey(r, disabled, selectActive);
  const entry = previews?.get(r.relPath);
  const merges = rowMerges ?? {};
  const gFrac = globalFrac ?? null;
  return (
    <div ref={ref} role="listitem" tabIndex={disabled ? -1 : 0} aria-current={active ? "true" : undefined} data-testid={`batch-row-${r.relPath}`} className={`svg-row batch-row ${r.status}${active ? " active" : ""}${r.selected ? " selected" : ""}`} onClick={onRowClick} onKeyDown={onKeyDown}>
      <CheckCell r={r} toggle={toggle} />
      <ScanThumb relPath={r.relPath} thumbFor={thumbFor} thumb={thumb} />
      <ScanFileCell r={r} />
      <RowMergeCell r={r} globalFrac={gFrac} rowMerges={merges} setRowMerge={setRowMerge} clearRowMerge={clearRowMerge} />
      <PreviewCell entry={entry} />
      <DateCell mtime={r.mtime} />
      <ScanStatusCell r={r} />
      <OpenCell r={r} copyPath={copyPath} />
    </div>
  );
}

export default function ScanTable(props: ScanTableProps) {
  return (
    <div className="svg-panel" data-testid="scan-table">
      <Header rows={props.rows} />
      <div className="pair-table">
        <Columns />
        <div className="svg-rows" role="list" aria-label="Batch images" data-testid="batch-rows">
          {props.rows.length === 0 ? <p className="svg-empty">No _AI images found in this folder.</p> : props.rows.map((r) => <RowView key={r.relPath} r={r} {...props} />)}
        </div>
      </div>
      <Footer count={props.rows.length} />
    </div>
  );
}

function isActive(relPath: string, activeId: string | null): boolean {
  return activeId !== null && relPath.toLowerCase() === activeId.toLowerCase();
}

function useRowClick(r: Row, disabled: boolean, selectRow: ScanTableProps["selectRow"], selectActive: ScanTableProps["selectActive"]) {
  return useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      const t = e.target as HTMLElement;
      if (t.closest('input[type="checkbox"]') || t.closest("button") || t.closest("input[type=range]")) return;
      const mods: RowMods = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey };
      const intent = selectIntent(mods);
      if (intent === "replace") selectActive(r.relPath);
      else selectRow(r.relPath, intent);
    },
    [r, disabled, selectRow, selectActive],
  );
}

function useRowKey(r: Row, disabled: boolean, selectActive: ScanTableProps["selectActive"]) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (disabled) return;
        selectActive(r.relPath);
      }
    },
    [r, disabled, selectActive],
  );
}

function useActiveScroll(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return ref;
}
