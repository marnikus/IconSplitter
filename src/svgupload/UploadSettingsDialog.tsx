// UploadSettingsDialog.tsx — the per-icon settings (design §2/§5). The point of
// this dialog is the ORIGIN line beside every field: a value either follows the
// global default or overrides it for this icon, and "Reset to defaults" hands
// every one of them back. The values it edits are the SAME numbers the geometry,
// the raster and the export record read — there is no second settings vocabulary.
//
// EPS is shown here as it will behave: with no converter configured the dialog
// says the export will be Partial and that no .eps file is written at all,
// instead of letting the user tick a box that cannot be honoured.

import { BG_PRESETS, resolveBackground, selectCustom, selectPreset, type PreviewBackground } from "../lib/svgbackground";
import { LIMITS, type UploadDefaults, type SettingField } from "../lib/svgupload/settings";
import type { UploadRow } from "../lib/svgupload/rows";
import { Modal } from "./UploadModal";

export interface SettingsDialogProps {
  row: UploadRow;
  /** The effective values, and which of them this icon overrides. */
  values: UploadDefaults;
  origin: Record<SettingField, "default" | "override">;
  /** False when no EPS converter is configured (the export would be Partial). */
  canEps: boolean;
  onChange: (field: SettingField, value: unknown) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function SettingsDialog(p: SettingsDialogProps) {
  const v = p.values;
  return (
    <Modal title={`Export settings — ${p.row.exportBase}`} testid="up-settings-dialog" onClose={p.onClose}>
      <p className="up-note">Every field below starts at the global default; changing one writes an override for this icon only.</p>
      <GeometryFields p={p} />
      <BackgroundField background={v.background} origin={p.origin.background} onChange={(bg) => p.onChange("background", bg)} />
      <OutputFields p={p} />
      {v.includeEps && !p.canEps && (
        <p className="up-warn-line" data-testid="up-dialog-eps-warning">
          No EPS converter is configured, so this export will be Partial: the SVG and the JPEG are written, and no .eps file is written at all.
        </p>
      )}
      <EpsConverter value={v.epsConverter} origin={p.origin.epsConverter} onChange={(url) => p.onChange("epsConverter", url)} />
      <div className="up-dialog-actions">
        <button className="svg-btn ghost" data-testid="up-dialog-reset" onClick={p.onReset}>Reset to defaults</button>
        <button className="svg-btn" data-testid="up-dialog-close" onClick={p.onClose}>Done</button>
      </div>
    </Modal>
  );
}

/** The three numbers that decide the artboard and the stroke. */
function GeometryFields({ p }: { p: SettingsDialogProps }) {
  const v = p.values;
  return (
    <div className="up-grid">
      <NumberField testid="up-dialog-padding" label="Artboard padding" unit={v.padding.unit} value={v.padding.value} origin={p.origin.padding}
        onChange={(value) => p.onChange("padding", { ...v.padding, value })} />
      <NumberField testid="up-dialog-scale" label="Icon scale" unit="×" value={v.outputScale} origin={p.origin.outputScale}
        onChange={(value) => p.onChange("outputScale", value)} />
      <NumberField testid="up-dialog-stroke" label="Stroke width" unit={v.stroke.unit} value={v.stroke.value} origin={p.origin.stroke}
        onChange={(value) => p.onChange("stroke", { ...v.stroke, value, enabled: true })} />
    </div>
  );
}

/** The JPEG target and quality, plus the two switches. */
function OutputFields({ p }: { p: SettingsDialogProps }) {
  const v = p.values;
  return (
    <>
      <div className="up-grid">
        <NumberField testid="up-dialog-mp" label="JPEG target" unit="MP" value={v.jpeg.targetMp} origin={p.origin.jpeg}
          onChange={(value) => p.onChange("jpeg", { ...v.jpeg, targetMp: value })} />
        <NumberField testid="up-dialog-quality" label="JPEG quality" unit="0–1" value={v.jpeg.quality} origin={p.origin.jpeg}
          onChange={(value) => p.onChange("jpeg", { ...v.jpeg, quality: value })} />
      </div>
      <div className="up-grid">
        <Toggle testid="up-dialog-svgo" label="Optimise the SVG (SVGO)" on={v.optimizeSvg} origin={p.origin.optimizeSvg}
          onChange={(on) => p.onChange("optimizeSvg", on)} />
        <Toggle testid="up-dialog-eps" label="Include EPS" on={v.includeEps} origin={p.origin.includeEps}
          onChange={(on) => p.onChange("includeEps", on)} />
      </div>
    </>
  );
}

/** The one colour that is flattened behind the artwork in BOTH outputs. */
function BackgroundField({ background, origin, onChange }: {
  background: PreviewBackground; origin: "default" | "override"; onChange: (bg: PreviewBackground) => void;
}) {
  return (
    <label className="up-field">
      <span className="up-field-label">Background <em className="up-count" data-testid="up-dialog-background-origin">{origin}</em></span>
      <span className="up-bg-row">
        <select className="svg-input" data-testid="up-dialog-background" value={background.preset}
          onChange={(e) => onChange(pickBackground(background, e.target.value))}>
          {BG_PRESETS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          <option value="custom">Custom</option>
        </select>
        {background.preset === "custom" && (
          <input type="color" data-testid="up-dialog-background-custom" value={background.custom}
            onChange={(e) => onChange(selectCustom(background, e.target.value))} />
        )}
        <span className="up-preview-swatch" style={{ background: resolveBackground(background) }} aria-hidden="true" />
      </span>
    </label>
  );
}

/** The converter endpoint: the URL, or nothing (EPS then reports Partial). */
function EpsConverter({ value, origin, onChange }: {
  value: string; origin: "default" | "override"; onChange: (url: string) => void;
}) {
  return (
    <label className="up-field">
      <span className="up-field-label">EPS converter URL <em className="up-count" data-testid="up-dialog-converter-origin">{origin}</em></span>
      <input className="svg-input" data-testid="up-dialog-converter" type="url" placeholder="http://localhost:8899/eps — leave empty for no EPS"
        value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NumberField({ testid, label, unit, value, origin, onChange }: {
  testid: string; label: string; unit: string; value: number; origin: "default" | "override"; onChange: (value: number) => void;
}) {
  return (
    <label className="up-field">
      <span className="up-field-label">{label} <em className="up-count" data-testid={`${testid}-origin`}>{origin}</em></span>
      <span className="up-inline">
        <input className="svg-input" data-testid={testid} type="number" value={value} min={0} max={LIMITS.paddingMax}
          onChange={(e) => onChange(Number(e.target.value))} />
        <span className="svg-chip">{unit}</span>
      </span>
    </label>
  );
}

function Toggle({ testid, label, on, origin, onChange }: {
  testid: string; label: string; on: boolean; origin: "default" | "override"; onChange: (on: boolean) => void;
}) {
  return (
    <label className="up-field">
      <span className="up-field-label">{label} <em className="up-count" data-testid={`${testid}-origin`}>{origin}</em></span>
      <input type="checkbox" data-testid={testid} checked={on} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** The preset/custom rule every background control in the tab shares. */
export function pickBackground(bg: PreviewBackground, value: string): PreviewBackground {
  if (value === "custom") return { ...bg, preset: "custom" };
  const preset = BG_PRESETS.find((b) => b.id === value);
  return preset === undefined ? bg : selectPreset(bg, preset.id);
}
