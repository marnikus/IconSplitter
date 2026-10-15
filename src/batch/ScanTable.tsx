// ScanTable.tsx — Batch folders list + review (approved/declined/warning) + preview
// 9-col flex grid, yellow warning line for not-4

import { useCallback, useEffect, useRef } from "react";
import type { Row, RowMergeMap } from "./useBatch";
import type { RowMods } from "../selectionv2/ReviewList";
import { selectIntent } from "../lib/reviewselect";
import { fmtDate, fmtTime } from "../selection/fmt";
import { useThumbCache } from "./ScanThumb";
import ScanStatusCell from "./ScanStatusCell";
import type { PreviewEntry } from "./useBatchPreview";
import BatchRowMergeBar from "./BatchRowMergeBar";
import BatchThumbInfoCell from "./BatchThumbInfoCell";
import type { BatchReviewStatus } from "../lib/statefile";

export interface ScanTableProps {
  /** I-68: answers whether this row's stored preview was made under other settings. */
  rowStale?: (relPath: string) => boolean;
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
  decide?: (ids: string[], review: BatchReviewStatus) => void;
}

export { useThumbCache };

function Header({ rows }: { rows: Row[] }) {
  const missing = rows.filter((r) => r.status === "missing" || r.status === "deleted").length;
  const refMissing = rows.filter((r) => r.refRelPath === null).length;
  const warning = rows.filter((r) => r.review === "warning").length;
  return (
    <header className="svg-head">
      <div className="svg-title"><h1>BATCH FOLDERS / IMAGES</h1><span data-testid="batch-row-count">{rows.length}</span><span>one file per pair</span></div>
      <div className="svg-attention">
        <span className="running" data-testid="batch-missing-count">{missing} missing</span>
        <span className="needs" data-testid="batch-refmissing-count">{refMissing} ref missing</span>
        {warning > 0 && <span className="needs" data-testid="batch-warning-count" style={{ color: "#facc15" }}>{warning} warning (not 4 icons)</span>}
      </div>
    </header>
  );
}

function Columns() {
  return (
    <div className="svg-columns batch-columns" aria-hidden="true">
      <span /><span>AI Image / File</span><span>Detection</span><span>Preview splits</span><span>Review</span><span>Decision</span><span>Created</span><span>Status</span><span>Open</span>
    </div>
  );
}

function Footer({ count }: { count: number }) {
  return (
    <footer className="svg-list-footer">
      <span data-testid="batch-footer">Showing {count} images</span>
      <span className="svg-hints">↑↓ active row · E select active · Q deselect active · Click = active only · Checkbox = select · Shift range · Ctrl toggle · Approve/Decline in Decision</span>
    </footer>
  );
}

function CheckCell({ r, toggle }: { r: Row; toggle: (rel: string) => void }) {
  const disabled = r.status === "missing" || r.status === "deleted";
  return (
    <input type="checkbox" className="svg-check" data-testid={`row-select-${r.relPath}`} checked={r.selected} disabled={disabled} aria-label={`Select ${r.name}`} title="Checkbox changes checks only" onClick={(e) => e.stopPropagation()} onChange={() => toggle(r.relPath)} />
  );
}

function DateCell({ mtime }: { mtime: number }) {
  return (<div className="svg-cell"><span>{fmtDate(mtime)}</span><small>{fmtTime(mtime)} local</small></div>);
}

function OpenCell({ r, copyPath }: { r: Row; copyPath: (rel: string) => void }) {
  return (
    <div className="svg-file-actions">
      <button type="button" className="svg-btn tiny" data-testid={`row-open-${r.relPath}`} onClick={(e) => { e.stopPropagation(); copyPath(r.relPath); }}>Open in File Explorer</button>
    </div>
  );
}

function PreviewCount({ entry, stale }: { entry: PreviewEntry; stale: boolean }) {
  const isWarning = entry.count !== 4;
  return (
    <span
      className={`text-xs font-medium ${isWarning ? "text-amber-300" : "text-emerald-300"}`}
      data-testid={`batch-preview-count-${entry.relPath}`}
      data-stale={stale ? "true" : "false"}
      title={stale ? "Rendered with other settings — Preview splits will re-render this row" : undefined}
    >
      {entry.count} icon{entry.count === 1 ? "" : "s"}{isWarning ? " ⚠ not 4" : " ✓"}{stale ? " ⟳" : ""}
    </span>
  );
}

function PreviewThumbs({ entry }: { entry: PreviewEntry }) {
  return (
    <div className="flex min-w-0 w-full flex-wrap gap-1.5 py-1" data-testid={`batch-preview-strip-${entry.relPath}`}>
      {entry.thumbs.map((src, i) => <img key={i} src={src} alt="" className="h-12 w-12 rounded border border-white/10 bg-white object-contain" data-testid={`batch-preview-thumb-${entry.relPath}-${i}`} style={{ flex: "none" }} />)}
      {entry.thumbs.length === 0 && entry.count > 0 && <span className="text-[11px] text-slate-500">count {entry.count}</span>}
    </div>
  );
}

function PreviewCell({ entry, stale }: { entry: PreviewEntry | undefined; stale: boolean }) {
  if (!entry) return <div className="svg-cell min-w-0 w-full text-xs text-slate-500">—</div>;
  if (entry.status === "loading") return <div className="svg-cell min-w-0 w-full text-xs text-slate-400" data-testid={`batch-preview-count-${entry.relPath}`}>Loading…</div>;
  if (entry.status === "error") return <div className="svg-cell min-w-0 w-full text-xs text-rose-400" data-testid={`batch-preview-count-${entry.relPath}`}>Failed</div>;
  const isWarning = entry.count !== 4;
  return (
    <div className="flex min-w-0 w-full flex-col gap-1">
      <PreviewCount entry={entry} stale={stale} />
      <PreviewThumbs entry={entry} />
      {isWarning && <small className="text-[10px] text-amber-300" data-testid={`batch-preview-warning-${entry.relPath}`}>⚠ Expected 4, got {entry.count}</small>}
    </div>
  );
}

function reviewLabel(review: BatchReviewStatus): string {
  if (review === "approved") return "Approved";
  if (review === "declined") return "Declined";
  if (review === "warning") return "Warning";
  return "Pending";
}

function reviewCls(review: BatchReviewStatus): string {
  if (review === "approved") return "approved";
  if (review === "declined") return "declined";
  if (review === "warning") return "warning";
  return "pending";
}

function reviewIcon(review: BatchReviewStatus): string {
  if (review === "warning") return "⚠ ";
  if (review === "approved") return "✓ ";
  if (review === "declined") return "✕ ";
  return "";
}

function ReviewCell({ review }: { review: BatchReviewStatus }) {
  return (
    <div className="svg-cell" data-testid={`batch-review-${review}`}>
      <span className={`svg-badge ${reviewCls(review)}`} data-testid={`batch-review-badge-${review}`}>{reviewIcon(review)}{reviewLabel(review)}</span>
    </div>
  );
}

function DecisionActions({ r, decide }: { r: Row; decide?: (ids: string[], review: BatchReviewStatus) => void }) {
  if (!decide) return <div className="svg-cell">—</div>;
  const click = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div className="svg-decision-actions flex gap-1">
      <button type="button" className="svg-btn tiny warning" data-testid={`batch-warning-${r.relPath}`} title="Mark warning" onClick={click(() => decide([r.relPath], "warning"))}>⚠</button>
      <button type="button" className="svg-btn tiny success" data-testid={`batch-approve-${r.relPath}`} title="Approve" onClick={click(() => decide([r.relPath], "approved"))}>✓</button>
      <button type="button" className="svg-btn tiny danger" data-testid={`batch-decline-${r.relPath}`} title="Decline" onClick={click(() => decide([r.relPath], "declined"))}>✕</button>
    </div>
  );
}

function RowMergeCell({ r, globalFrac, rowMerges, setRowMerge, clearRowMerge }: { r: Row; globalFrac: number | null; rowMerges: RowMergeMap; setRowMerge?: ScanTableProps["setRowMerge"]; clearRowMerge?: ScanTableProps["clearRowMerge"] }) {
  if (r.status === "missing" || r.status === "deleted") return <div className="svg-cell min-w-0 w-full text-xs text-slate-500">—</div>;
  const key = r.relPath.toLowerCase();
  const ov = Object.prototype.hasOwnProperty.call(rowMerges, key) ? rowMerges[key] : undefined;
  return (
    <div className="min-w-0 w-full">
      <BatchRowMergeBar relPath={r.relPath} globalFrac={globalFrac} overrideFrac={ov} onApply={(rp, v) => setRowMerge?.(rp, v as number | null)} onReset={(rp) => clearRowMerge?.(rp)} />
    </div>
  );
}

function rowClass(r: Row, active: boolean): string {
  const review = r.review ?? "pending";
  const isWarning = review === "warning";
  return `svg-row batch-row ${r.status} ${review}${active ? " active" : ""}${r.selected ? " selected" : ""}${isWarning ? " warning-row" : ""}`;
}

function rowStyle(_review: BatchReviewStatus): React.CSSProperties | undefined {
  return undefined;
}

function RowView({ r, toggle, selectRow, selectActive, copyPath, thumbFor, thumb, activeId, previews, rowMerges, globalFrac, setRowMerge, clearRowMerge, decide, rowStale }: { r: Row } & ScanTableProps) {
  const disabled = r.status === "missing" || r.status === "deleted";
  const active = isActive(r.relPath, activeId);
  const ref = useActiveScroll(active);
  const onRowClick = useRowClick(r, disabled, selectRow, selectActive);
  const onKeyDown = useRowKey(r, disabled, selectActive);
  const entry = previews?.get(r.relPath);
  const review = r.review ?? "pending";
  return (
    <div ref={ref} role="listitem" tabIndex={disabled ? -1 : 0} aria-current={active ? "true" : undefined} data-testid={`batch-row-${r.relPath}`} className={rowClass(r, active)} onClick={onRowClick} onKeyDown={onKeyDown} style={rowStyle(review)}>
      <CheckCell r={r} toggle={toggle} />
      <BatchThumbInfoCell r={r} thumbFor={thumbFor} thumb={thumb} />
      <RowMergeCell r={r} globalFrac={globalFrac ?? null} rowMerges={rowMerges ?? {}} setRowMerge={setRowMerge} clearRowMerge={clearRowMerge} />
      <PreviewCell entry={entry} stale={rowStale?.(r.relPath) ?? false} />
      <ReviewCell review={review} />
      <DecisionActions r={r} decide={decide} />
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
