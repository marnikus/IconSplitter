// SvgBuilderColoredStyle.tsx — "Colored icons" under Icon style (2026-11-23).
// Icons of a registered style (Colored wiggle …) keep their own paints; here the
// sheet can set their strokes' colour and width and their fills' colour — each
// left empty keeps every icon's own (↺). Strokes and fills never mix, and the
// outlined (line-stroke) icons above never change here.
import { RANGES, clampTo } from "../lib/svgBuilder/ranges";
import type { SheetConfig } from "../lib/svgBuilder/types";
import type { Edit } from "./SvgBuilderCustomize";
import { Field } from "./SvgBuilderFields";

type Icons = SheetConfig["icons"];
/** Where a colour picker starts while each icon keeps its own colour. */
const OWN_START = "#7A869A";

export default function ColoredIconStyle({ i, edit }: { i: Icons; edit: Edit }) {
  return <div className="bld-colored" data-testid="builder-colored-icons">
    <p className="bld-info">◐ Colored icons — strokes and fills apart</p>
    <OwnColor label="Stroke color" own="Own stroke colors" value={i.coloredStroke} testid="builder-colored-stroke"
      onChange={(coloredStroke) => edit("icons", { coloredStroke })} />
    <OwnWidth i={i} edit={edit} />
    <OwnColor label="Fill color" own="Own fill colors" value={i.coloredFill} testid="builder-colored-fill"
      onChange={(coloredFill) => edit("icons", { coloredFill })} />
  </div>;
}

function OwnColor({ label, own, value, testid, onChange }: { label: string; own: string; value: string; testid: string; onChange: (v: string) => void }) {
  return <Field label={label} aside={value === "" ? <span className="bld-hint">{own}</span> : <code className="bld-hex">{value}</code>}>
    <div className="bld-own-row">
      <input type="color" className="bld-picker" data-testid={testid} aria-label={`Colored icons: ${label.toLowerCase()}`}
        value={(value || OWN_START).toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      {value !== "" && <button type="button" className="svg-btn tiny" data-testid={`${testid}-own`} onClick={() => onChange("")}>↺ {own}</button>}
    </div>
  </Field>;
}

function OwnWidth({ i, edit }: { i: Icons; edit: Edit }) {
  const own = i.coloredStrokeWidth === 0;
  const range = RANGES.strokeWidth;
  return <Field label="Stroke width" aside={<span className="bld-pill" data-testid="builder-colored-width-value">{own ? "own" : `${i.coloredStrokeWidth.toFixed(1)}px`}</span>}>
    <input type="range" className="bld-range" data-testid="builder-colored-width" aria-label="Colored icons: stroke width" min={range.min} max={range.max} step={range.step}
      value={own ? i.strokeWidth : i.coloredStrokeWidth} onChange={(e) => edit("icons", { coloredStrokeWidth: clampTo(range, Number(e.target.value)) }, true)} />
    {!own && <button type="button" className="svg-btn tiny" data-testid="builder-colored-width-own" onClick={() => edit("icons", { coloredStrokeWidth: 0 })}>↺ Own stroke widths</button>}
  </Field>;
}
