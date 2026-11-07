// BuilderControls.tsx — the sheet's controls (design §6). Every field is a
// clamped number, a colour, or one of a closed set, and every change goes through
// `withConfigPatch` — so the UI can never hold a value the reader would refuse.
//
// The controls are honest about what they do NOT do yet: the selection engine
// (P4) owns which icons fill the cells, and this panel says so rather than
// offering a re-roll button that would have nothing to roll.

import type { BuilderConfig } from "../lib/builder/defaults";
import { CONFIG_LIMITS, withConfigPatch } from "../lib/builder/config";

export interface BuilderControlsProps {
  config: BuilderConfig;
  /** One change: clamp, persist, record on the undo timeline (P3 wiring). */
  onChange: (next: BuilderConfig) => void;
}

/** A numeric control whose arrows remain inside the reader's own range. */
function Num({ id, label, value, limit, step = 1, onChange }: {
  id: string; label: string; value: number; limit: { min: number; max: number }; step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="bld-field">
      <span className="bld-label">{label}</span>
      <input className="bld-input" data-testid={`builder-${id}`} type="number" value={value}
        min={limit.min} max={limit.max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** A colour control: the sheet's own paper or ink. */
function Colour({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (c: string) => void }) {
  return (
    <label className="bld-field">
      <span className="bld-label">{label}</span>
      <input className="bld-colour" data-testid={`builder-${id}`} type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** One closed-set control (a select is the honest control for a fixed list). */
function Pick<T extends string>({ id, label, value, options, onChange }: {
  id: string; label: string; value: T; options: readonly { value: T; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="bld-field">
      <span className="bld-label">{label}</span>
      <select className="bld-input" data-testid={`builder-${id}`} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
      </select>
    </label>
  );
}

export default function BuilderControls({ config, onChange }: BuilderControlsProps) {
  const set = <K extends "artboard" | "grid" | "icons">(section: K, patch: Partial<BuilderConfig[K]>) =>
    onChange(withConfigPatch(config, section, patch));
  return (
    <section className="bld-controls" data-testid="builder-controls" aria-label="Sheet controls">
      <SheetGroup config={config} set={set} />
      <GridGroup config={config} set={set} />
      <CaptionGroup config={config} set={set} />
      <p className="bld-note" data-testid="builder-controls-note">
        Which icons fill the cells is the next step (recipes and locks). Until then the sheet takes the
        first approved icons in scan order.
      </p>
    </section>
  );
}

type Setter = <K extends "artboard" | "grid" | "icons">(section: K, patch: Partial<BuilderConfig[K]>) => void;

/** The sheet's paper: size, padding, background. */
function SheetGroup({ config, set }: { config: BuilderConfig; set: Setter }) {
  return (
    <div className="bld-group" data-testid="builder-controls-sheet">
      <h3 className="bld-group-title">Sheet</h3>
      <Num id="width" label="Width" value={config.artboard.width} limit={CONFIG_LIMITS.width}
        onChange={(width) => set("artboard", { width })} />
      <Num id="height" label="Height" value={config.artboard.height} limit={CONFIG_LIMITS.height}
        onChange={(height) => set("artboard", { height })} />
      <Num id="padding" label="Padding" value={config.artboard.padding} limit={CONFIG_LIMITS.padding}
        onChange={(padding) => set("artboard", { padding })} />
      <Colour id="paper" label="Paper" value={config.artboard.background}
        onChange={(background) => set("artboard", { background })} />
    </div>
  );
}

/** The grid: how many cells and how big. */
function GridGroup({ config, set }: { config: BuilderConfig; set: Setter }) {
  return (
    <div className="bld-group" data-testid="builder-controls-grid">
      <h3 className="bld-group-title">Grid</h3>
      <Num id="columns" label="Columns" value={config.grid.columns} limit={CONFIG_LIMITS.columns}
        onChange={(columns) => set("grid", { columns })} />
      <Num id="rows" label="Rows" value={config.grid.rows} limit={CONFIG_LIMITS.rows}
        onChange={(rows) => set("grid", { rows })} />
      <Num id="gap-x" label="Gap X" value={config.grid.gapX} limit={CONFIG_LIMITS.gap}
        onChange={(gapX) => set("grid", { gapX })} />
      <Num id="gap-y" label="Gap Y" value={config.grid.gapY} limit={CONFIG_LIMITS.gap}
        onChange={(gapY) => set("grid", { gapY })} />
      <Num id="box" label="Icon box" value={config.icons.box} limit={CONFIG_LIMITS.box}
        onChange={(box) => set("icons", { box })} />
    </div>
  );
}

/** The captions under each icon. */
function CaptionGroup({ config, set }: { config: BuilderConfig; set: Setter }) {
  return (
    <div className="bld-group" data-testid="builder-controls-captions">
      <h3 className="bld-group-title">Captions</h3>
      <Pick id="caption-case" label="Case" value={config.grid.captionCase}
        options={[{ value: "normal", text: "As written" }, { value: "upper", text: "UPPER" }]}
        onChange={(captionCase) => set("grid", { captionCase })} />
      <Num id="caption-size" label="Size" value={config.grid.captionSize} limit={CONFIG_LIMITS.captionSize}
        onChange={(captionSize) => set("grid", { captionSize })} />
      <label className="bld-field bld-field-inline">
        <input data-testid="builder-captions" type="checkbox" checked={config.grid.captions}
          onChange={(e) => set("grid", { captions: e.target.checked })} />
        <span className="bld-label">Show captions</span>
      </label>
    </div>
  );
}
