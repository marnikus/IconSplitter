// SvgBuilderGuides.tsx — red layout guides over the artboard (2026-11-13):
// box edges across the artboard, each cell box, the icon area inside it, the
// padding boundary and the banner edge. Preview only (never exported); "▦
// Guides" switches them, the slider sets their opacity. Lines stay 1 screen px
// at any zoom.
import { useMemo } from "react";
import { sheetGuides } from "../lib/svgBuilder/guides";
import type { Rect } from "../lib/svgBuilder/types";
import type { BuilderApi } from "./useSvgBuilder";

const RED = "#ff3b30";

function box(r: Rect, key: string, extra: Record<string, string | number> = {}) {
  return <rect key={key} x={r.x} y={r.y} width={r.width} height={r.height} fill="none" stroke={RED} {...extra} />;
}

export default function SvgBuilderGuides({ b, zoom }: { b: BuilderApi; zoom: number }) {
  const g = useMemo(() => sheetGuides(b.layout), [b.layout]);
  if (!b.prefs.showGuides) return null;
  const { width, height } = b.config.artboard;
  const px = 1 / Math.max(0.05, zoom);
  return <svg className="bld-guides" data-testid="builder-guides" viewBox={`0 0 ${width} ${height}`} width={width} height={height}
    style={{ opacity: b.prefs.guideOpacity / 100 }} aria-hidden="true" strokeWidth={px}>
    {g.vertical.map((x) => <line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke={RED} strokeOpacity={0.55} data-guide="column" />)}
    {g.horizontal.map((y) => <line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke={RED} strokeOpacity={0.55} data-guide="row" />)}
    {box(g.content, "content", { strokeDasharray: `${6 * px} ${4 * px}`, "data-guide": "padding" })}
    {g.banner !== null && box(g.banner, "banner", { strokeDasharray: `${2 * px} ${3 * px}`, "data-guide": "banner" })}
    {g.cells.map((c, i) => box(c, `c${i}`, { "data-guide": "cell" }))}
    {g.glyphs.map((c, i) => box(c, `g${i}`, { strokeOpacity: 0.6, strokeDasharray: `${3 * px} ${2 * px}`, "data-guide": "icon" }))}
  </svg>;
}
