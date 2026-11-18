// SvgBuilderTextBoxes.tsx — part of ▦ Guides (2026-11-15): the rebalance's
// measured ink boxes around the title and the subtitle, and its gaps with their
// px, over the artboard (banner.ts `spreadInkBoxes`), at the guides' opacity.
// Preview only, never exported; lines stay 1 screen px at any zoom.
import { useMemo } from "react";
import { spreadInkBoxes } from "../lib/svgBuilder/banner";
import type { BuilderApi } from "./useSvgBuilder";

const RED = "#ff3b30";

export default function SvgBuilderTextBoxes({ b, zoom }: { b: BuilderApi; zoom: number }) {
  const boxes = useMemo(() => (b.prefs.showGuides ? spreadInkBoxes(b.config, b.layout) : null), [b.prefs.showGuides, b.config, b.layout]);
  if (boxes === null) return null;
  const { width, height } = b.config.artboard;
  const px = 1 / Math.max(0.05, zoom);
  return <svg className="bld-guides" data-testid="builder-text-boxes" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" strokeWidth={px}
    style={{ opacity: b.prefs.guideOpacity / 100 }}>
    {[boxes.title, boxes.sub].map((r, i) => <rect key={i} data-ink={i === 0 ? "title" : "subtitle"} x={r.x} y={r.y} width={r.width} height={r.height} fill="none" stroke={RED} />)}
    {boxes.gaps.map((g, i) => {
      const vertical = g.height > g.width; // a column's gaps run down the middle line (2026-11-17)
      return <g key={`g${i}`} data-gap={i}>
        <rect x={g.x} y={g.y} width={Math.max(0, g.width)} height={Math.max(0, g.height)} fill={RED} />
        <text x={vertical ? g.x + g.width / 2 + 4 * px : g.x + g.width / 2} y={vertical ? g.y + g.height / 2 : g.y - 4 * px}
          fill={RED} fontSize={10 * px} textAnchor={vertical ? "start" : "middle"}>{Math.round(vertical ? g.height : g.width)}</text>
      </g>;
    })}
  </svg>;
}
