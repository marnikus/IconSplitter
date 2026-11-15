// SvgBuilderRowProportions.tsx — the rebalance's proportions (2026-11-15): how
// big the gaps are (% of the banner width), how tall the title may be (% of the
// banner height) and the subtitle's size (% of the title). Bigger gaps = smaller
// texts. Shown beside Auto rebalance (Customize and the banner's quick bar).
import { RANGES } from "../lib/svgBuilder/ranges";
import type { SheetConfig } from "../lib/svgBuilder/types";

type Banner = SheetConfig["banner"];
type Key = "rowGapPct" | "titleFillPct" | "subRatioPct";

const ROWS: readonly [Key, string, string][] = [
  ["rowGapPct", "Gap % of width", "row-gap"], ["titleFillPct", "Title % of height", "title-fill"], ["subRatioPct", "Subtitle % of title", "sub-ratio"],
];

export default function RowProportions({ banner, prefix, onChange }: { banner: Banner; prefix: string; onChange: (patch: Partial<Banner>) => void }) {
  return <div className="bld-row-props" data-testid={`${prefix}-row-props`}>
    {ROWS.map(([key, label, id]) => <label key={key} className="bld-quick-row">
      <span className="bld-quick-title">{label}</span>
      <input type="range" className="bld-range" data-testid={`${prefix}-${id}`} aria-label={label}
        min={RANGES[key].min} max={RANGES[key].max} step={1} value={banner[key]} onChange={(e) => onChange({ [key]: Number(e.target.value) })} />
      <span className="bld-quick-value">{banner[key]} %</span>
    </label>)}
  </div>;
}
