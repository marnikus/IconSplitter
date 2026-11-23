// SvgList.tsx — the source list of the Generate SVG tab (prompt §2): head with
// the row count and the attention counters, the column header, the scrolling
// rows, and the footer line with the hotkey hints.
import { memo, useMemo } from "react";
import { useCheckedRows } from "../ui/checkedrows";
import { useRowPresentation } from "../ui/rowpresentation";
import { shownLabel } from "../lib/svglist";
import SvgRow, { type SvgRowActions } from "./SvgRow";
import { indexSvgRows, type SvgRowIndex } from "./panelcounts";
import type { SvgGenApi } from "./useSvgGen";
import { withRowIndexes } from "../ui/LazyPreview";

export interface SvgListProps {
  g: Pick<SvgGenApi, "rows" | "visible">;
  rowIndex?: SvgRowIndex;
  actions: SvgRowActions;
}

function sameListProps(a: SvgListProps, b: SvgListProps): boolean {
  return a.g.visible === b.g.visible
    && a.g.rows === b.g.rows
    && a.rowIndex === b.rowIndex
    && a.actions.checked === b.actions.checked
    && a.actions.activeId === b.actions.activeId
    && a.actions.imgRunning === b.actions.imgRunning
    && a.actions.thumb === b.actions.thumb
    && a.actions.bg === b.actions.bg
    && a.actions.rootToken === b.actions.rootToken
    && a.actions.rootRef === b.actions.rootRef;
}

function SvgListView({ g, rowIndex, actions }: SvgListProps) {
  const { checked, activeId, imgRunning, thumb, bg, ...handlers } = actions;
  const a = useRowPresentation(handlers);
  const register = useCheckedRows(checked, activeId, true);
  const computedIndex = useMemo(() => rowIndex ?? indexSvgRows(g.rows), [rowIndex, g.rows]);
  const imgBusySet = useMemo(() => new Set(imgRunning), [imgRunning]);
  const queued = useMemo(() => {
    let count = 0;
    for (const r of g.visible) if (r.queued && !r.running) count += 1;
    return count;
  }, [g.visible]);
  const rows = useMemo(() => withRowIndexes(g.visible.map((row) => (
    <SvgRow key={row.source.id} row={row} thumb={thumb} bg={bg}
      imgBusy={imgBusySet.has(row.source.id)} a={a} register={register} />
  ))), [g.visible, thumb, bg, imgBusySet, a, register]);
  return (
    <div className="svg-panel" data-testid="svg-list">
      <ListHead visibleCount={g.visible.length} running={computedIndex.running} queued={queued} attention={computedIndex.issues} />
      <div className="pair-table">
        <Columns />
        <div className="svg-rows" role="listbox" aria-label="SVG generation sources" data-testid="svg-rows">
          {rows}
          {g.visible.length === 0 && <p className="svg-empty" data-testid="svg-empty">No approved source matches these filters.</p>}
        </div>
      </div>
      <Footer shown={g.visible.length} total={g.rows.length} />
    </div>
  );
}

export default memo(SvgListView, sameListProps);

const ListHead = memo(function ListHead({ visibleCount, running, queued, attention }: {
  visibleCount: number; running: number; queued: number; attention: number;
}) {
  return (
    <header className="svg-head">
      <div className="svg-title">
        <h1>APPROVED SOURCES / SVG OUTPUT</h1>
        <span data-testid="svg-row-count">{visibleCount}</span>
        <span>one file per pair</span>
      </div>
      <div className="svg-attention">
        <span className="running" data-testid="svg-running-count">{running} generating</span>
        <span className="queued" data-testid="svg-queued-count">{queued} next attempt</span>
        <span className="needs" data-testid="svg-attention-count">{attention} need attention</span>
      </div>
    </header>
  );
});

const Footer = memo(function Footer({ shown, total }: { shown: number; total: number }) {
  return (
    <footer className="svg-list-footer">
      <span data-testid="svg-footer-summary">{shownLabel(shown, total)}</span>
      <span className="svg-hints">
        ↑↓ active row · <kbd>E/Q</kbd> check/uncheck · <kbd>Space</kbd> toggle · <kbd>G</kbd> generate · <kbd>A/D/W</kbd> review · <kbd>V</kbd> code
      </span>
    </footer>
  );
});

const Columns = memo(function Columns() {
  return (
    <div className="svg-columns" aria-hidden="true">
      <span />
      <span>Approved AI / newest SVG</span>
      <span>File / path / persistence</span>
      <span>Generation</span>
      <span>Review</span>
      <span>Version / tokens / cost</span>
      <span>Files / code / history</span>
      <span>Generate / decision</span>
    </div>
  );
});
