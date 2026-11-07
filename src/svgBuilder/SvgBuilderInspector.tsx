// SvgBuilderInspector.tsx — all layout controls, grouped and dark-themed. Every
// edit yields a full validated SheetConfig and one undo entry.
import type { BannerPosition, CaptionCase, SheetConfig, TitleFace } from "../lib/svgBuilder/types";
import { ColorField, InspectorGroup, NumField, SelectField, TextField, ToggleField } from "./SvgBuilderFields";
import type { BuilderApi } from "./useSvgBuilder";

const POSITIONS: readonly BannerPosition[] = ["left", "right", "top", "bottom", "none"];
const CASES: readonly CaptionCase[] = ["upper", "normal"];
const FACES: readonly TitleFace[] = ["sans", "serif", "mono"];
type Update = (mutate: (config: SheetConfig) => SheetConfig) => void;

export default function SvgBuilderInspector({ b }: { b: BuilderApi }) {
  const c = b.config;
  const update: Update = (mutate) => b.actions.setConfig(mutate(c));
  return <aside className={`builder-inspector${b.prefs.inspectorOpen ? "" : " is-collapsed"}`}
    data-testid="builder-inspector" aria-label="Sheet layout inspector">
    <InspectorHead b={b} />
    {b.prefs.inspectorOpen && <>
      <InspectorArtboard c={c} update={update} />
      <InspectorGrid c={c} update={update} />
      <InspectorIcons c={c} update={update} />
      <InspectorBanner c={c} update={update} />
    </>}
  </aside>;
}

function InspectorHead({ b }: { b: BuilderApi }) {
  return <div className="builder-card-head"><div><span className="builder-eyebrow">INSPECTOR</span><h3>Sheet layout</h3></div>
    <button type="button" className="builder-btn subtle" data-testid="builder-inspector-toggle"
      aria-expanded={b.prefs.inspectorOpen}
      onClick={() => b.actions.toggleInspector(!b.prefs.inspectorOpen)}>{b.prefs.inspectorOpen ? "−" : "+"}</button></div>;
}

function InspectorArtboard({ c, update }: { c: SheetConfig; update: Update }) {
  return <InspectorGroup title="Artboard">
    <NumField label="WIDTH" testid="builder-artboard-width" value={c.artboard.width} min={320} max={4096}
      onChange={(v) => update((x) => ({ ...x, artboard: { ...x.artboard, width: v } }))} />
    <NumField label="HEIGHT" testid="builder-artboard-height" value={c.artboard.height} min={240} max={4096}
      onChange={(v) => update((x) => ({ ...x, artboard: { ...x.artboard, height: v } }))} />
    <NumField label="PADDING" testid="builder-artboard-padding" value={c.artboard.padding} min={0} max={160}
      onChange={(v) => update((x) => ({ ...x, artboard: { ...x.artboard, padding: v } }))} />
    <NumField label="RADIUS" testid="builder-artboard-radius" value={c.artboard.radius} min={0} max={80}
      onChange={(v) => update((x) => ({ ...x, artboard: { ...x.artboard, radius: v } }))} />
    <ColorField label="BACKGROUND" testid="builder-artboard-background" value={c.artboard.background}
      onChange={(v) => update((x) => ({ ...x, artboard: { ...x.artboard, background: v } }))} />
  </InspectorGroup>;
}

function InspectorGrid({ c, update }: { c: SheetConfig; update: Update }) {
  return <InspectorGroup title="Grid & captions">
    <NumField label="COLUMNS" testid="builder-grid-cols" value={c.grid.columns} min={1} max={20}
      onChange={(v) => update((x) => ({ ...x, grid: { ...x.grid, columns: v } }))} />
    <NumField label="ROWS" testid="builder-grid-rows" value={c.grid.rows} min={1} max={20}
      onChange={(v) => update((x) => ({ ...x, grid: { ...x.grid, rows: v } }))} />
    <NumField label="GAP X" testid="builder-gap-x" value={c.grid.gapX} min={0} max={200}
      onChange={(v) => update((x) => ({ ...x, grid: { ...x.grid, gapX: v } }))} />
    <NumField label="GAP Y" testid="builder-gap-y" value={c.grid.gapY} min={0} max={200}
      onChange={(v) => update((x) => ({ ...x, grid: { ...x.grid, gapY: v } }))} />
    <ToggleField label="Show captions" testid="builder-captions" checked={c.grid.captions}
      onChange={(v) => update((x) => ({ ...x, grid: { ...x.grid, captions: v } }))} />
    <NumField label="CAPTION SIZE" testid="builder-caption-size" value={c.grid.captionSize} min={6} max={36}
      onChange={(v) => update((x) => ({ ...x, grid: { ...x.grid, captionSize: v } }))} />
    <SelectField label="CAPTION CASE" testid="builder-caption-case" value={c.grid.captionCase} options={CASES}
      onChange={(v) => update((x) => ({ ...x, grid: { ...x.grid, captionCase: v as CaptionCase } }))} />
    <ColorField label="CAPTION INK" testid="builder-caption-color" value={c.grid.captionColor}
      onChange={(v) => update((x) => ({ ...x, grid: { ...x.grid, captionColor: v } }))} />
  </InspectorGroup>;
}

function InspectorIcons({ c, update }: { c: SheetConfig; update: Update }) {
  return <InspectorGroup title="Icon strokes">
    <NumField label="ICON BOX" testid="builder-icon-box" value={c.icons.box} min={16} max={240}
      onChange={(v) => update((x) => ({ ...x, icons: { ...x.icons, box: v } }))} />
    <NumField label="STROKE WIDTH" testid="builder-stroke-width" value={c.icons.strokeWidth} min={0.5} max={8} step={0.1}
      onChange={(v) => update((x) => ({ ...x, icons: { ...x.icons, strokeWidth: v } }))} />
    <ColorField label="STROKE INK" testid="builder-stroke-color" value={c.icons.color}
      onChange={(v) => update((x) => ({ ...x, icons: { ...x.icons, color: v } }))} />
    <SelectField label="LINE CAP" testid="builder-linecap" value={c.icons.linecap} options={["round", "square"]}
      onChange={(v) => update((x) => ({ ...x, icons: { ...x.icons, linecap: v as "round" | "square" } }))} />
  </InspectorGroup>;
}

function InspectorBanner({ c, update }: { c: SheetConfig; update: Update }) {
  return <InspectorGroup title="Banner / metadata">
    <InspectorBannerText c={c} update={update} />
    <InspectorBannerColors c={c} update={update} />
    <InspectorBannerToggles c={c} update={update} />
  </InspectorGroup>;
}

function InspectorBannerText({ c, update }: { c: SheetConfig; update: Update }) {
  return <>
    <TextField label="TITLE" testid="builder-banner-title" value={c.banner.title}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, title: v } }))} />
    <TextField label="SUBTITLE" testid="builder-banner-subtitle" value={c.banner.subtitle}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, subtitle: v } }))} />
    <SelectField label="POSITION" testid="builder-banner-position" value={c.banner.position} options={POSITIONS}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, position: v as BannerPosition } }))} />
    <NumField label="BANNER SIZE" testid="builder-banner-size" value={c.banner.size} min={80} max={600}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, size: v } }))} />
    <NumField label="TITLE SIZE" testid="builder-banner-title-size" value={c.banner.titleSize} min={10} max={96}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, titleSize: v } }))} />
    <NumField label="SUBTITLE SIZE" testid="builder-banner-subtitle-size" value={c.banner.subtitleSize} min={8} max={48}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, subtitleSize: v } }))} />
    <SelectField label="TITLE FACE" testid="builder-banner-face" value={c.banner.titleFace} options={FACES}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, titleFace: v as TitleFace } }))} />
  </>;
}

function InspectorBannerColors({ c, update }: { c: SheetConfig; update: Update }) {
  return <>
    <ColorField label="BANNER BG" testid="builder-banner-background" value={c.banner.background}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, background: v } }))} />
    <ColorField label="ACCENT" testid="builder-banner-accent" value={c.banner.accent}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, accent: v } }))} />
    <ColorField label="TITLE INK" testid="builder-banner-text-color" value={c.banner.textColor}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, textColor: v } }))} />
    <ColorField label="SUBTITLE INK" testid="builder-banner-subtitle-color" value={c.banner.subtitleColor}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, subtitleColor: v } }))} />
  </>;
}

function InspectorBannerToggles({ c, update }: { c: SheetConfig; update: Update }) {
  return <>
    <ToggleField label="Hero icon" testid="builder-banner-hero" checked={c.banner.hero}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, hero: v } }))} />
    <ToggleField label="Divider" testid="builder-banner-divider" checked={c.banner.divider}
      onChange={(v) => update((x) => ({ ...x, banner: { ...x.banner, divider: v } }))} />
  </>;
}
