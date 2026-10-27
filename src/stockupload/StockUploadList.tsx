// StockUploadList.tsx — O(1) checked/active projected list of exported packages.

import { cloneElement, useMemo } from "react";
import { useCheckedRows } from "../ui/checkedrows";
import { useRowPresentation } from "../ui/rowpresentation";
import StockUploadRowView, { type StockRowPresentation } from "./StockUploadRow";
import type { StockUploadApi } from "./useStockUpload";

function toRowPresentation(g: StockUploadApi): StockRowPresentation {
  return {
    thumb: g.model.prefs.thumb,
    bg: g.model.prefs.bg,
    rootToken: g.model.rootToken,
    rootRef: g.rootRef,
    rowBadges: g.rowBadges,
    history: g.history,
    presets: g.presetState.presets,
    toggleCheck: g.toggleCheck,
    selectRow: g.selectRow,
    openLocation: g.openLocation,
    toggleRowBadge: g.toggleRowBadge,
    metaDraftOf: g.metaDraftOf,
    editMeta: g.editMeta,
    acceptMeta: g.acceptMeta,
    copyMeta: g.copyMeta,
  };
}

function useRenderedRows(g: StockUploadApi) {
  const a = useRowPresentation(toRowPresentation(g));
  const register = useCheckedRows(g.checked, g.activeId, true);
  const base = useMemo(() => g.visible.map((item) => (
    <StockUploadRowView key={item.id} item={item} a={a} register={register} />
  )), [g.visible, a, register]);
  return useMemo(() => {
    const at = g.visible.findIndex((item) => item.id === g.activeId);
    if (at < 0) return base;
    const copy = base.slice();
    copy[at] = cloneElement(base[at], { active: true });
    return copy;
  }, [base, g.visible, g.activeId]);
}

export default function StockUploadList({ g }: { g: StockUploadApi }) {
  const rows = useRenderedRows(g);
  return (
    <div className="svg-panel" data-testid="stock-upload-list">
      <ListHeader visibleCount={g.visible.length} />
      <div className="pair-table">
        <ListColumns />
        <div className="svg-rows" role="listbox" aria-label="Exported packages to upload" data-testid="stock-rows">
          {rows}
          {g.visible.length === 0 && (
            <p className="svg-empty" data-testid="stock-empty">
              No exported items found in `export/` folders with a committed `export.json`.
            </p>
          )}
        </div>
      </div>
      <ListFooter visible={g.visible.length} total={g.items.length} />
    </div>
  );
}

function ListHeader({ visibleCount }: { visibleCount: number }) {
  return (
    <header className="svg-head">
      <div className="svg-title">
        <h1>EXPORTED STOCK PACKAGES</h1>
        <span data-testid="stock-row-count">{visibleCount}</span>
        <span>strictly `export/` + committed `export.json`</span>
      </div>
    </header>
  );
}

function ListColumns() {
  return (
    <div className="up-columns" aria-hidden="true">
      <span />
      <span>Preview</span>
      <span>Item / export path</span>
      <span>Formats</span>
      <span>Metadata</span>
      <span>Stock sites</span>
      <span>Actions</span>
    </div>
  );
}

function ListFooter({ visible, total }: { visible: number; total: number }) {
  return (
    <footer className="svg-list-footer">
      <span data-testid="stock-footer-summary">Showing {visible} of {total} exported items</span>
      <span className="svg-hints">↑↓ active · E/Q check/uncheck · click a row to edit & embed metadata</span>
    </footer>
  );
}
