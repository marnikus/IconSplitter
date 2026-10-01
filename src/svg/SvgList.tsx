// SvgList.tsx — the source list of the Generate SVG tab (prompt §2): head with
// the row count and the attention counters, the column header, the scrolling
// rows, and the footer line with the hotkey hints. The list holds no state of
// its own: filtering, sorting and the selection all come from the hook, so the
// same rules the Selection V2 tab uses stay in one place (RULE 10).

import type { CSSProperties } from "react";
import { shownLabel } from "../lib/svglist";
import SvgRow, { type SvgRowActions } from "./SvgRow";
import type { SvgGenApi } from "./useSvgGen";

export interface SvgListProps {
  g: SvgGenApi;
  actions: SvgRowActions;
}

export default function SvgList({ g, actions }: SvgListProps) {
  const running = g.rows.filter((r) => r.running).length;
  const attention = g.rows.filter((r) => r.status === "failed" || r.corrupt).length;
  // One variable for every row geometry: the thumbnails, the preview frame and
  // the grid column that holds them all read --svg-thumb (the same idiom the
  // Selection V2 list uses). Publishing it here is what lets the column follow
  // the zoom instead of overflowing into the text columns beside it.
  const style = { "--svg-thumb": `${g.thumb}px` } as CSSProperties;
  return (
    <div className="svg-panel" data-testid="svg-list" style={style}>
      <ListHead shown={g.visible.length} running={running} attention={attention} />
      <Columns />
      <div className="svg-rows" role="listbox" aria-label="SVG generation sources" data-testid="svg-rows">
        {g.visible.map((row) => <SvgRow key={row.source.id} row={row} a={actions} />)}
        {g.visible.length === 0 && <p className="svg-empty" data-testid="svg-empty">No approved source matches these filters.</p>}
      </div>
      <footer className="svg-list-footer">
        <span data-testid="svg-footer-summary">{shownLabel(g.visible.length, g.rows.length)}</span>
        <span className="svg-hints">
          ↑↓ active row · <kbd>Space</kbd> select · <kbd>G</kbd> generate · <kbd>A</kbd> approve · <kbd>D</kbd> decline · <kbd>V</kbd> code
        </span>
      </footer>
    </div>
  );
}

/** The list's own head: what is shown, and the two counters that move. */
function ListHead({ shown, running, attention }: { shown: number; running: number; attention: number }) {
  return (
    <header className="svg-head">
      <div className="svg-title">
        <h1>APPROVED SOURCES / SVG OUTPUT</h1>
        <span data-testid="svg-row-count">{shown}</span>
        <span>per-file sidecars</span>
      </div>
      <div className="svg-attention">
        <span className="running" data-testid="svg-running-count">{running} generating</span>
        <span className="needs" data-testid="svg-attention-count">{attention} need attention</span>
      </div>
    </header>
  );
}

/** The column header — static text, so it cannot drift from the row layout. */
function Columns() {
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
}
