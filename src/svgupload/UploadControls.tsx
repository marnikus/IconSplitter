// UploadControls.tsx — the settings block of the SVG-to-upload tab (design §4/§5).
// The GLOBAL DEFAULTS live here: artboard padding with its unit, the output
// scale, the background, the OUTPUT stroke width with its unit, the JPEG target
// and quality, and the two switches (optimise on by default, EPS optional).
// Values are clamped by the same parser that reads them back from storage, so a
// typed number and a stored number cannot disagree. Zoom is NOT here — it is a
// display setting and lives in the bulk bar beside the previews it changes.

import { BG_PRESETS, normalizeHex, selectCustom, selectPreset, type PreviewBackground } from "../lib/svgbackground";
import type { LengthUnit } from "../lib/svgupload/units";
import type { UploadDefaults } from "../lib/svgupload/settings";

export interface UploadControlsProps {
  defaults: UploadDefaults;
  busy: boolean;
  onDefaults: (patch: Partial<UploadDefaults>) => void;
}

export default function UploadControls({ defaults, busy, onDefaults }: UploadControlsProps) {
  const set = (patch: Partial<UploadDefaults>) => (busy ? undefined : onDefaults(patch));
  return (
    <section className="svg-controls" data-testid="up-controls" aria-label="Export settings">
      <div className="up-grid">
        <PaddingField defaults={defaults} busy={busy} set={set} />
        <ScaleField defaults={defaults} busy={busy} set={set} />
        <BackgroundField defaults={defaults} busy={busy} set={set} />
        <StrokeField defaults={defaults} busy={busy} set={set} />
        <JpegFields defaults={defaults} busy={busy} set={set} />
        <SwitchFields defaults={defaults} busy={busy} set={set} />
      </div>
    </section>
  );
}

interface FieldProps {
  defaults: UploadDefaults;
  busy: boolean;
  set: (patch: Partial<UploadDefaults>) => void;
}

/** Artboard padding: the value and its unit, never a bare number (design C4). */
function PaddingField({ defaults, busy, set }: FieldProps) {
  const padding = defaults.padding;
  return (
    <label className="svg-field">
      <span className="svg-label">PADDING</span>
      <span className="up-line">
        <input className="svg-input" data-testid="up-padding" type="number" min={0} step={0.5} disabled={busy}
          value={padding.value} onChange={(e) => set({ padding: { value: numberOr(e.target.value, padding.value), unit: padding.unit } })} />
        <UnitSelect testid="up-padding-unit" value={padding.unit} disabled={busy}
          onChange={(unit) => set({ padding: { value: padding.value, unit } })} />
      </span>
    </label>
  );
}

function ScaleField({ defaults, busy, set }: FieldProps) {
  return (
    <label className="svg-field">
      <span className="svg-label">OUTPUT SCALE</span>
      <input className="svg-input" data-testid="up-scale" type="number" min={0.1} max={8} step={0.1} disabled={busy}
        value={defaults.outputScale} onChange={(e) => set({ outputScale: numberOr(e.target.value, defaults.outputScale) })} />
    </label>
  );
}

/** The frame colour flattens the JPEG and sits BEHIND the artwork (design C6). */
function BackgroundField({ defaults, busy, set }: FieldProps) {
  const bg = defaults.background;
  return (
    <label className="svg-field">
      <span className="svg-label">BACKGROUND</span>
      <span className="up-line">
        <select className="svg-input" data-testid="up-bg" value={bg.preset} disabled={busy}
          onChange={(e) => set({ background: pickBackground(bg, e.target.value) })}>
          {BG_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          <option value="custom">Custom</option>
        </select>
        {bg.preset === "custom" && (
          <input className="svg-input" data-testid="up-bg-custom" type="color" value={bg.custom} disabled={busy}
            onChange={(e) => { const hex = normalizeHex(e.target.value); if (hex !== null) set({ background: selectCustom(bg, hex) }); }} />
        )}
      </span>
    </label>
  );
}

/** The OUTPUT stroke width (2.2 pt is the documented example); off by default. */
function StrokeField({ defaults, busy, set }: FieldProps) {
  const stroke = defaults.stroke;
  return (
    <label className="svg-field">
      <span className="svg-label">OUTPUT STROKE WIDTH</span>
      <span className="up-line">
        <input data-testid="up-stroke-on" type="checkbox" checked={stroke.enabled} disabled={busy}
          aria-label="Apply a stroke width to the export" onChange={(e) => set({ stroke: { ...stroke, enabled: e.target.checked } })} />
        <input className="svg-input" data-testid="up-stroke" type="number" min={0} step={0.1}
          disabled={busy || !stroke.enabled} value={stroke.value}
          onChange={(e) => set({ stroke: { ...stroke, value: numberOr(e.target.value, stroke.value) } })} />
        <UnitSelect testid="up-stroke-unit" value={stroke.unit} disabled={busy || !stroke.enabled}
          onChange={(unit) => set({ stroke: { ...stroke, unit } })} />
      </span>
    </label>
  );
}

/** 15.1 MP and the quality; the profile is recorded honestly by the pipeline. */
function JpegFields({ defaults, busy, set }: FieldProps) {
  const jpeg = defaults.jpeg;
  return (
    <>
      <label className="svg-field">
        <span className="svg-label">JPEG TARGET (MP)</span>
        <input className="svg-input" data-testid="up-jpeg-mp" type="number" min={1} max={30} step={0.1} disabled={busy}
          value={jpeg.targetMp} onChange={(e) => set({ jpeg: { ...jpeg, targetMp: numberOr(e.target.value, jpeg.targetMp) } })} />
      </label>
      <label className="svg-field">
        <span className="svg-label">JPEG QUALITY</span>
        <input className="svg-input" data-testid="up-jpeg-quality" type="number" min={0.3} max={1} step={0.05} disabled={busy}
          value={jpeg.quality} onChange={(e) => set({ jpeg: { ...jpeg, quality: numberOr(e.target.value, jpeg.quality) } })} />
      </label>
    </>
  );
}

function SwitchFields({ defaults, busy, set }: FieldProps) {
  return (
    <>
      <label className="svg-field up-switch">
        <input data-testid="up-svgo" type="checkbox" checked={defaults.optimizeSvg} disabled={busy}
          onChange={(e) => set({ optimizeSvg: e.target.checked })} />
        <span>Optimise SVG (SVGO)</span>
      </label>
      <label className="svg-field up-switch">
        <input data-testid="up-eps" type="checkbox" checked={defaults.includeEps} disabled={busy}
          onChange={(e) => set({ includeEps: e.target.checked })} />
        <span>Also export EPS (needs a converter)</span>
      </label>
    </>
  );
}

function UnitSelect({ testid, value, disabled, onChange }: {
  testid: string; value: LengthUnit; disabled: boolean; onChange: (unit: LengthUnit) => void;
}) {
  return (
    <select className="svg-input" data-testid={testid} value={value} disabled={disabled} aria-label="Unit"
      onChange={(e) => onChange(e.target.value as LengthUnit)}>
      <option value="pt">pt</option>
      <option value="px">px</option>
      <option value="%">%</option>
    </select>
  );
}

/** One select value -> the validated payload; an unknown id keeps the colour. */
export function pickBackground(current: PreviewBackground, id: string): PreviewBackground {
  if (id === "custom") return selectCustom(current, current.custom);
  return BG_PRESETS.some((p) => p.id === id) ? selectPreset(current, id as Exclude<PreviewBackground["preset"], "custom">) : current;
}

/** A half-typed number keeps the previous value; the panel clamps the patch. */
function numberOr(text: string, fallback: number): number {
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
}
