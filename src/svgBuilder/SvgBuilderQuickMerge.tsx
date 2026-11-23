// SvgBuilderQuickMerge.tsx — big icons in the quick toolbar (2026-11-23). On an
// icon of a grid of at least 2 × 2: ⊞ marks its cell (a bright red frame on the
// artboard); four marked cells of a 2 × 2 square become one big icon at once.
// On a big icon: ≡ its own stroke width (↺ back to the sheet's) and ✕ breaks it
// back into four cells.
import { RANGES } from "../lib/svgBuilder/ranges";
import { activeMerges } from "../lib/svgBuilder/merges";
import type { BuilderApi } from "./useSvgBuilder";

/** The slot of the hovered cell (its overlay or its drawn group), or null. */
export function cellSlotOf(el: Element): number | null {
  const raw = el.closest("[data-cell-index]")?.getAttribute("data-cell-index") ?? null;
  const n = Number(raw);
  return raw === null || !Number.isInteger(n) || n < 0 ? null : n;
}

export const isBigCell = (b: BuilderApi, el: Element): boolean => {
  const slot = cellSlotOf(el);
  return slot !== null && b.layout.cells[slot]?.span === 2;
};

/** Four small squares: the "combine cells" mark. */
function MergeGlyph() {
  return <svg className="bld-quick-merge-glyph" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" /><path d="M8 1.5v13M1.5 8h13" />
  </svg>;
}

export function MergeButtons({ b, el, toggle }: { b: BuilderApi; el: Element; toggle: (panel: "merge") => void }) {
  const slot = cellSlotOf(el);
  const cell = slot === null ? undefined : b.layout.cells[slot];
  if (slot === null || cell === undefined) return null;
  if (cell.span === 2) return <BigButtons b={b} slot={slot} toggle={toggle} />;
  if (b.config.grid.columns < 2 || b.config.grid.rows < 2) return null;
  return <MarkButton b={b} slot={slot} marked={b.mergeMarks.includes(cell.pos ?? cell.index)} />;
}

/** On a big icon: its own stroke, and ✕ back into four cells. */
function BigButtons({ b, slot, toggle }: { b: BuilderApi; slot: number; toggle: (panel: "merge") => void }) {
  return <>
    <button type="button" className="bld-quick-btn" data-testid="builder-quick-merge-stroke" title="This big icon's stroke width"
      aria-label="Big icon stroke width" onClick={() => toggle("merge")}>≡</button>
    <button type="button" className="bld-quick-btn" data-testid="builder-quick-merge-break" title="Break this big icon back into 4 cells"
      aria-label="Break the big icon into 4 cells" onClick={() => b.actions.breakMerge(slot)}>✕</button>
  </>;
}

function MarkButton({ b, slot, marked }: { b: BuilderApi; slot: number; marked: boolean }) {
  return <button type="button" className={`bld-quick-btn bld-quick-merge${marked ? " is-on" : ""}`} data-testid="builder-quick-merge-mark"
    aria-pressed={marked} aria-label={marked ? "Unmark this cell" : "Mark this cell to combine"}
    title={marked ? "Unmark this cell" : "Mark this cell — 4 marked cells of a 2 × 2 square become one big icon"}
    onClick={() => b.actions.markMergeCell(slot)}><MergeGlyph /></button>;
}

/** ≡ on a big icon: its own stroke width; 0 follows the sheet's. */
export function MergeStrokePanel({ b, el }: { b: BuilderApi; el: Element }) {
  const slot = cellSlotOf(el);
  const cell = slot === null ? undefined : b.layout.cells[slot];
  const merge = activeMerges(b.config.grid).find((m) => m.source === (cell?.pos ?? cell?.index));
  if (slot === null || merge === undefined) return null;
  const own = merge.strokeWidth > 0;
  const value = own ? merge.strokeWidth : b.config.icons.strokeWidth;
  const r = RANGES.strokeWidth;
  return <div className="bld-quick-panel" data-testid="builder-quick-merge-stroke-panel">
    <div className="bld-quick-row"><b className="bld-quick-title">Big icon stroke</b><span className="bld-quick-value">{own ? `${value} px` : "Sheet stroke"}</span></div>
    {own && <button type="button" className="svg-btn tiny" data-testid="builder-quick-merge-stroke-own" onClick={() => b.actions.setMergeStroke(slot, 0)}>↺ Sheet stroke</button>}
    <input type="range" className="bld-range" data-testid="builder-quick-merge-stroke-range" aria-label="Big icon stroke width"
      min={r.min} max={r.max} step={r.step} value={value} onChange={(e) => b.actions.setMergeStroke(slot, Number(e.target.value))} />
    <div className="bld-quick-row bld-quick-ends"><span>{r.min}</span><span>{r.max}</span></div>
  </div>;
}
