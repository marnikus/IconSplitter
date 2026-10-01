// ReviewList.tsx — the full-width list review layout (spec V2 §2B): no large
// comparison panel, one pair per row, column header and footer summary. Row
// height follows the zoom slider through the --v2-thumb custom property.

import type { CSSProperties } from "react";
import type { Decision, ViewPair } from "../lib/reviewfilter";
import type { SideThumbFor } from "../selection/thumbs";
import ReviewRow from "./ReviewRow";

export interface ReviewListProps {
  rows: ViewPair[];
  total: number;
  activeId: string | null;
  checked: string[];
  thumb: number;
  autoNext: boolean;
  thumbFor: SideThumbFor;
  activate: (id: string) => void;
  setAutoNext: (on: boolean) => void;
  toggleCheck: (id: string) => void;
  decide: (id: string, d: Decision) => void;
  openSide: (relPath: string) => void;
  clearFilters: () => void;
}

const COLUMNS = [
  "", "Original / AI result", "File / relative path / pair ID", "Created",
  "Dimensions / format", "Review status", "Open files", "Decision",
];

export default function ReviewList(p: ReviewListProps) {
  const style = { "--v2-thumb": `${p.thumb}px` } as CSSProperties;
  return (
    <section className="v2-panel" data-testid="v2-list" style={style}>
      <ListHead shown={p.rows.length} total={p.total} autoNext={p.autoNext} setAutoNext={p.setAutoNext} />
      <div className="v2-columns" aria-hidden="true">
        {COLUMNS.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="v2-rows" role="list" aria-label="Image review pairs" data-testid="v2-rows">
        {p.rows.length === 0
          ? <ListEmpty total={p.total} clearFilters={p.clearFilters} />
          : p.rows.map((row) => <ReviewRow key={row.pairId} row={row} p={p} />)}
      </div>
      <footer className="v2-list-footer">
        <span data-testid="v2-footer">Showing {p.rows.length} of {p.total} pairs</span>
        <span className="v2-hints"><kbd>A</kbd> approve · <kbd>D</kbd> decline · <kbd>↑ ↓</kbd> move the active row</span>
      </footer>
    </section>
  );
}

function ListHead({ shown, total, autoNext, setAutoNext }: {
  shown: number; total: number; autoNext: boolean; setAutoNext: (on: boolean) => void;
}) {
  return (
    <div className="v2-head">
      <div className="v2-title">
        <h1>Image pairs</h1>
        <span>Original and AI results · {shown} shown of {total}</span>
      </div>
      <label className="v2-tools v2-autonext">
        <input type="checkbox" data-testid="v2-autonext" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
        Next pending after a decision
      </label>
    </div>
  );
}

function ListEmpty({ total, clearFilters }: { total: number; clearFilters: () => void }) {
  return total === 0
    ? (
      <p className="v2-empty" data-testid="v2-empty">
        No images found — this folder holds no originals and no <code>_AI</code> results.
      </p>
    )
    : (
      <p className="v2-empty" data-testid="v2-nomatch">
        No pairs match the current filters.
        <button type="button" className="v2-btn tiny" data-testid="v2-clear-empty" onClick={clearFilters}>Clear filters</button>
      </p>
    );
}
