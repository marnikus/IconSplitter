// SvgBuilderCustomize.tsx — right column "Customize · live" (reference layout):
// RESET, then collapsible Artboard (starts collapsed), Grid, Icon style, Banner.
// Every edit yields a full validated SheetConfig; sliders coalesce into one undo gesture.
import { RANGES } from "../lib/svgBuilder/ranges";
import type { SheetConfig } from "../lib/svgBuilder/types";
import { ColorChip, Field, NumBox, Section, Segmented, Slider, Stepper, Swatches, Toggle } from "./SvgBuilderFields";
import { BannerSection, IconStyleSection } from "./SvgBuilderCustomizeStyle";
import type { BuilderApi } from "./useSvgBuilder";

/** Patch one group of the config; `gesture` = part of a continuous drag. */
export type Edit = <K extends keyof SheetConfig>(group: K, patch: Partial<SheetConfig[K]>, gesture?: boolean) => void;

export default function SvgBuilderCustomize({ b }: { b: BuilderApi }) {
  const c = b.config;
  const edit: Edit = (group, patch, gesture) =>
    b.actions.setConfig({ ...c, [group]: { ...c[group], ...patch } }, `Change ${String(group)}`, gesture);
  return <aside className="bld-col bld-customize" data-testid="builder-inspector" aria-label="Customize the sheet">
    <div className="bld-col-head">
      <h3>Customize <span className="bld-live">· live</span></h3>
      <button type="button" className="svg-btn ghost tiny" data-testid="builder-reset" onClick={b.actions.resetConfig}>RESET</button>
    </div>
    <div className="bld-col-scroll">
      <ArtboardSection c={c} edit={edit} />
      <GridSection c={c} edit={edit} />
      <IconStyleSection c={c} edit={edit} />
      <BannerSection b={b} edit={edit} />
    </div>
  </aside>;
}

function ArtboardSection({ c, edit }: { c: SheetConfig; edit: Edit }) {
  const a = c.artboard;
  return <Section title="Artboard" badge={`${a.width}×${a.height}`} initiallyOpen={false} testid="builder-section-artboard">
    <div className="bld-two">
      <NumBox label="W" unit="px" value={a.width} range={RANGES.width} testid="builder-width" onCommit={(width, g) => edit("artboard", { width }, g)} />
      <NumBox label="H" unit="px" value={a.height} range={RANGES.height} testid="builder-height" onCommit={(height, g) => edit("artboard", { height }, g)} />
    </div>
    <Swatches label="Canvas" value={a.background} testid="builder-canvas" onChange={(background) => edit("artboard", { background })} />
    <div className="bld-two">
      <NumBox label="Pad" unit="px" value={a.padding} range={RANGES.padding} testid="builder-padding" onCommit={(padding, g) => edit("artboard", { padding }, g)} />
      <NumBox label="Radius" unit="px" value={a.radius} range={RANGES.radius} testid="builder-radius" onCommit={(radius, g) => edit("artboard", { radius }, g)} />
    </div>
  </Section>;
}

function GridSection({ c, edit }: { c: SheetConfig; edit: Edit }) {
  const g = c.grid;
  return <Section title="Grid" badge={`${g.columns} × ${g.rows}`} testid="builder-section-grid">
    <Field label="Columns / rows">
      <div className="bld-two">
        <Stepper label="columns" value={g.columns} range={RANGES.columns} testid="builder-columns" onChange={(columns) => edit("grid", { columns })} />
        <Stepper label="rows" value={g.rows} range={RANGES.rows} testid="builder-rows" onChange={(rows) => edit("grid", { rows })} />
      </div>
    </Field>
    <div className="bld-two">
      <Slider label="Gap X" value={g.gapX} range={RANGES.gapX} testid="builder-gap-x" onChange={(gapX) => edit("grid", { gapX }, true)} />
      <Slider label="Gap Y" value={g.gapY} range={RANGES.gapY} testid="builder-gap-y" onChange={(gapY) => edit("grid", { gapY }, true)} />
    </div>
    <Toggle label="Captions below icons" hint="Name label under every glyph" checked={g.captions} testid="builder-captions"
      onChange={(captions) => edit("grid", { captions })} />
    {g.captions && <CaptionControls c={c} edit={edit} />}
  </Section>;
}

function CaptionControls({ c, edit }: { c: SheetConfig; edit: Edit }) {
  const g = c.grid;
  return <div className="bld-subcard" data-testid="builder-caption-controls">
    <ColorChip label="Caption ink" value={g.captionColor} testid="builder-caption-ink" onChange={(captionColor) => edit("grid", { captionColor })} />
    <Slider label="Caption size" value={g.captionSize} range={RANGES.captionSize} unit="px" testid="builder-caption-size"
      onChange={(captionSize) => edit("grid", { captionSize }, true)} />
    <Segmented label="Caption case" value={g.captionCase} testid="builder-caption-case"
      options={[{ value: "upper", label: "UPPERCASE" }, { value: "normal", label: "Capitalized" }]}
      onChange={(captionCase) => edit("grid", { captionCase })} />
  </div>;
}
