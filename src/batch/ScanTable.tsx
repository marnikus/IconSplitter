// ScanTable.tsx — Batch folders list, 6-col, same visual as SVG/V2

import { memo, useCallback, useEffect, useRef } from "react";
import type { Row } from "./useBatch";
import type { RowMods } from "../selectionv2/ReviewList";
import { selectIntent } from "../lib/reviewselect";
import { fmtDate, fmtTime } from "../selection/fmt";
import ScanThumb, { useThumbCache } from "./ScanThumb";
import ScanFileCell from "./ScanFileCell";
import ScanStatusCell from "./ScanStatusCell";
import PreviewStrip from "./preview/PreviewStrip";
import type { RowStates } from "../lib/previewstate";

export interface ScanTableProps {
  rows: Row[];
  thumb: number;
  activeId: string | null;
  toggle: (relPath: string) => void;
  selectRow: (id: string, intent: ReturnType<typeof selectIntent>) => void;
  copyPath: (relPath: string) => void;
  thumbFor: (relPath: string) => Promise<string>;
  /** Present while a preview session is open: the row's strip renders from here. */
  preview?: { states: RowStates; planned: Set<string> };
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
      <span className="svg-hints">↑↓ active row · E select active · Q deselect active · Click row, Shift range, Ctrl toggle · Bulk via buttons</span>
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

function RowView({ r, toggle, selectRow, copyPath, thumbFor, thumb, activeId, preview }: { r: Row } & ScanTableProps) {
  const disabled = r.status === "missing" || r.status === "deleted";
  const active = isActive(r.relPath, activeId);
  const ref = useActiveScroll(active);
  const onRowClick = useRowClick(r, disabled, selectRow);
  const onKeyDown = useRowKey(r, disabled, selectRow);
  return (
    <div ref={ref} role="listitem" tabIndex={disabled ? -1 : 0} aria-current={active ? "true" : undefined} data-testid={`batch-row-${r.relPath}`} className={`svg-row batch-row ${r.status}${active ? " active" : ""}${r.selected ? " selected" : ""}`} onClick={onRowClick} onKeyDown={onKeyDown}>
      <CheckCell r={r} toggle={toggle} />
      <ScanThumb relPath={r.relPath} thumbFor={thumbFor} thumb={thumb} />
      <ScanFileCell r={r} />
      <DateCell mtime={r.mtime} />
      <ScanStatusCell r={r} />
      <OpenCell r={r} copyPath={copyPath} />
      {preview?.planned.has(r.relPath.toLowerCase()) && <PreviewStrip row={r} states={preview.states} />}
    </div>
  );
}

/**
 * Memoized on purpose (design D9): a preview session updates its counter every few
 * hundred ms, and re-rendering 1000 rows for a counter text would make the tab the
 * bottleneck. Every prop here is either stable across such a render or carries the
 * data that really changed.
 */
function ScanTable(props: ScanTableProps) {
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

export default memo(ScanTable);

function isActive(relPath: string, activeId: string | null): boolean {
  return activeId !== null && relPath.toLowerCase() === activeId.toLowerCase();
}

function useRowClick(r: Row, disabled: boolean, selectRow: ScanTableProps["selectRow"]) {
  return useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      const t = e.target as HTMLElement;
      if (t.closest('input[type="checkbox"]') || t.closest("button")) return;
      const mods: RowMods = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey };
      // A bare click in this list does what the row's own checkbox does — flips it —
      // and never touches another row (2026-10-12).
      selectRow(r.relPath, selectIntent(mods, "toggle"));
    },
    [r, disabled, selectRow],
  );
}

function useRowKey(r: Row, disabled: boolean, selectRow: ScanTableProps["selectRow"]) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (disabled) return;
        selectRow(r.relPath, "replace");
      }
    },
    [r, disabled, selectRow],
  );
}

function useActiveScroll(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return ref;
}
