// SvgList.tsx — the source list of the Generate SVG tab (prompt §2): head with
// the row count and the attention counters, the column header, the scrolling
// rows, and the footer line with the hotkey hints. The list holds no state of
// its own: filtering, sorting and the selection all come from the hook, so the
// same rules the Selection V2 tab uses stay in one place (RULE 10).

import { shownLabel } from "../lib/svglist";
import SvgRow, { type SvgRowActions } from "./SvgRow";
import type { SvgGenApi } from "./useSvgGen";

export interface SvgListProps {
  g: SvgGenApi;
  actions: SvgRowActions;
}

export default function SvgList({ g, actions }: SvgListProps) {
  const running = g.rows.filter((r) => r.running).length;
  const queued = g.visible.filter((r) => r.queued && !r.running).length;
  const attention = g.rows.filter((r) => r.status === "failed" || r.corrupt).length;
  return (
    <div className="svg-panel" data-testid="svg-list">
      <header className="svg-head">
        <div className="svg-title">
          <h1>APPROVED SOURCES / SVG OUTPUT</h1>
          <span data-testid="svg-row-count">{g.visible.length}</span>
          <span>one file per pair</span>
        </div>
        <div className="svg-attention">
          <span className="running" data-testid="svg-running-count">{running} generating</span>
          <span className="queued" data-testid="svg-queued-count">{queued} next attempt</span>
          <span className="needs" data-testid="svg-attention-count">{attention} need attention</span>
        </div>
      </header>
      <div className="pair-table">
        <Columns />
        <div className="svg-rows" role="listbox" aria-label="SVG generation sources" data-testid="svg-rows">
          {g.visible.map((row) => <SvgRow key={row.source.id} row={row} a={actions} />)}
          {g.visible.length === 0 && <p className="svg-empty" data-testid="svg-empty">No approved source matches these filters.</p>}
        </div>
      </div>
      <Footer shown={g.visible.length} total={g.rows.length} />
    </div>
  );
}

/** What the list says under itself: how much is shown, and the hotkeys. */
function Footer({ shown, total }: { shown: number; total: number }) {
  return (
    <footer className="svg-list-footer">
      <span data-testid="svg-footer-summary">{shownLabel(shown, total)}</span>
      <span className="svg-hints">
        ↑↓ active row · <kbd>Space</kbd> select · <kbd>G</kbd> generate · <kbd>A</kbd> approve · <kbd>D</kbd> decline · <kbd>V</kbd> code
      </span>
    </footer>
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
