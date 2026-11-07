// SvgBuilderCustomizeStyle.tsx — "Icon style" and "Banner" sections of the
// Customize column (reference controls and order).
import { RANGES, bannerRange, clampTo } from "../lib/svgBuilder/ranges";
import type { BannerPosition, SheetConfig, TitleFace } from "../lib/svgBuilder/types";
import type { Edit } from "./SvgBuilderCustomize";
import { ColorChip, Field, Section, Segmented, Slider, Swatches, TextBox, Toggle, type SegOption } from "./SvgBuilderFields";
import type { BuilderApi } from "./useSvgBuilder";

const POSITIONS: readonly SegOption<BannerPosition>[] = [
  { value: "left", label: "← Left" }, { value: "top", label: "↑ Top" }, { value: "bottom", label: "↓ Bottom" },
  { value: "right", label: "→ Right" }, { value: "none", label: "— None" },
];
const FACES: readonly SegOption<TitleFace>[] = [
  { value: "sans", label: "Aa Grotesk" }, { value: "serif", label: "Aa Editorial" }, { value: "mono", label: "Aa Mono" },
];

export function IconStyleSection({ c, edit }: { c: SheetConfig; edit: Edit }) {
  const i = c.icons;
  return <Section title="Icon style" badge="fit to box" testid="builder-section-icons">
    <p className="bld-info">☰ Proportional fit · stroke-aware bounds</p>
    <Slider label="Icon box" value={i.box} range={RANGES.box} testid="builder-icon-box" display={`${i.box} × ${i.box} px`}
      onChange={(box) => edit("icons", { box }, true)} />
    <Slider label="Stroke width" value={i.strokeWidth} range={RANGES.strokeWidth} unit="px" testid="builder-stroke-width"
      onChange={(strokeWidth) => edit("icons", { strokeWidth }, true)} />
    <Swatches label="Stroke color" value={i.color} testid="builder-stroke-color" onChange={(color) => edit("icons", { color })} />
    <Field label="Line ends">
      <Segmented label="Line ends" value={i.linecap} testid="builder-linecap"
        options={[{ value: "round", label: "Round" }, { value: "square", label: "Square" }]} onChange={(linecap) => edit("icons", { linecap })} />
    </Field>
    <p className="bld-hint">Every glyph is scaled inside its box. Strokes never cross the edge.</p>
  </Section>;
}

export function BannerSection({ b, edit }: { b: BuilderApi; edit: Edit }) {
  const n = b.config.banner;
  const setPosition = (position: BannerPosition) =>
    edit("banner", { position, size: position === "none" ? n.size : clampTo(bannerRange(position), n.size) });
  return <Section title="Banner" badge={n.position === "none" ? "hidden" : n.position} testid="builder-section-banner">
    <Field label="Position">
      <Segmented label="Banner position" value={n.position} testid="builder-banner-position" options={POSITIONS} onChange={setPosition} />
    </Field>
    {n.position === "none"
      ? <p className="bld-empty-note" data-testid="builder-banner-hidden">Banner hidden. The full artboard is available for your grid.</p>
      : <BannerControls b={b} edit={edit} />}
  </Section>;
}

function BannerControls({ b, edit }: { b: BuilderApi; edit: Edit }) {
  const n = b.config.banner;
  const side = n.position === "left" || n.position === "right";
  return <>
    <Field label="Masthead">
      <Segmented label="Masthead" value={n.style} testid="builder-banner-style"
        options={[{ value: "solid", label: "Solid" }, { value: "split", label: "Split" }]} onChange={(style) => edit("banner", { style })} />
    </Field>
    <Slider label={side ? "Banner width" : "Banner height"} value={n.size} range={bannerRange(n.position)} unit="px"
      testid="builder-banner-size" onChange={(size) => edit("banner", { size }, true)} />
    <BannerColours n={n} edit={edit} />
    <TextBox label="Main title" value={n.title} placeholder="Icon sheet" testid="builder-title" onChange={(title) => edit("banner", { title }, true)} />
    <TextBox label="Supporting title" value={n.subtitle} placeholder="Editable stroke width" testid="builder-subtitle"
      onChange={(subtitle) => edit("banner", { subtitle }, true)} />
    <div className="bld-two">
      <Slider label="Title" value={n.titleSize} range={RANGES.titleSize} testid="builder-title-size" onChange={(titleSize) => edit("banner", { titleSize }, true)} />
      <Slider label="Subtitle" value={n.subtitleSize} range={RANGES.subtitleSize} testid="builder-subtitle-size"
        onChange={(subtitleSize) => edit("banner", { subtitleSize }, true)} />
    </div>
    <Segmented label="Title face" value={n.titleFace} testid="builder-title-face" options={FACES} onChange={(titleFace) => edit("banner", { titleFace })} />
    <Toggle label="Hero glyph" checked={n.hero} testid="builder-hero" onChange={(hero) => edit("banner", { hero })} />
    {n.hero && <HeroSelect b={b} edit={edit} />}
    <Toggle label="Accent rule" checked={n.divider} testid="builder-divider" onChange={(divider) => edit("banner", { divider })} />
  </>;
}

function BannerColours({ n, edit }: { n: SheetConfig["banner"]; edit: Edit }) {
  return <div className="bld-colours">
    <ColorChip label="Banner" value={n.background} testid="builder-banner-bg" onChange={(background) => edit("banner", { background })} />
    <ColorChip label="Accent" value={n.accent} testid="builder-accent" onChange={(accent) => edit("banner", { accent })} />
    <ColorChip label="Title ink" value={n.textColor} testid="builder-title-ink" onChange={(textColor) => edit("banner", { textColor })} />
    <ColorChip label="Subtitle" value={n.subtitleColor} testid="builder-subtitle-ink" onChange={(subtitleColor) => edit("banner", { subtitleColor })} />
  </div>;
}

function HeroSelect({ b, edit }: { b: BuilderApi; edit: Edit }) {
  return <Field label="Glyph">
    <select className="svg-input" data-testid="builder-hero-icon" aria-label="Hero glyph" value={b.config.banner.heroIconId ?? ""}
      onChange={(e) => edit("banner", { heroIconId: e.target.value === "" ? null : e.target.value })}>
      <option value="">First icon in the sheet</option>
      {b.assets.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
    </select>
  </Field>;
}
