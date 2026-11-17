// SvgBuilderHeroStyle.tsx — the banner hero's own style (2026-11-14): the icon's
// size and stroke, and the circle's size and stroke (0 hides the circles). Part
// of the sheet's look, so templates and preset JSON carry it.
import { RANGES } from "../lib/svgBuilder/ranges";
import type { SheetConfig } from "../lib/svgBuilder/types";
import type { Edit } from "./SvgBuilderCustomize";
import { Slider } from "./SvgBuilderFields";
import { bothScale, withBothScale } from "../lib/svgBuilder/herosize";

export default function HeroStyle({ n, edit }: { n: SheetConfig["banner"]; edit: Edit }) {
  return <div className="bld-text-placement" data-testid="builder-hero-style">
    <Slider label="Icon + circle size" value={bothScale(n)} range={RANGES.heroScale} unit="%" testid="builder-hero-both"
      onChange={(v) => edit("banner", withBothScale(n, v), true)} />
    <div className="bld-two">
      <Slider label="Icon size" value={n.heroScale} range={RANGES.heroScale} unit="%" testid="builder-hero-scale"
        onChange={(heroScale) => edit("banner", { heroScale }, true)} />
      <Slider label="Icon stroke" value={n.heroStroke} range={RANGES.heroStroke} unit="px" testid="builder-hero-stroke"
        onChange={(heroStroke) => edit("banner", { heroStroke }, true)} />
    </div>
    <div className="bld-two">
      <Slider label="Circle size" value={n.ringScale} range={RANGES.ringScale} unit="%" testid="builder-ring-scale"
        onChange={(ringScale) => edit("banner", { ringScale }, true)} />
      <Slider label="Circle stroke" value={n.ringStroke} range={RANGES.ringStroke} unit="px" testid="builder-ring-stroke"
        onChange={(ringStroke) => edit("banner", { ringStroke }, true)} />
    </div>
  </div>;
}
