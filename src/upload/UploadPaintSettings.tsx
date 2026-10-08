// UploadPaintSettings.tsx — the two PAINT rows of the export settings dialog
// (2026-10-08, stock review): the background (transparent, or a colour the
// SVG/EPS paint and the JPEG flattens onto) and the stroke colour (the
// artwork's own, or one hex every visible stroke gets). ONE picker renders
// both: the "none of ours" button, the shared swatches, a custom colour and
// the value readout. Split out of UploadSettingsDialog so that file stays
// under the RULE 16 line; it owns the shell, this owns paint.

import { BG_PRESETS, normalizeHex } from "../lib/svgbackground";
import { STROKE_COLOR_ARTWORK, TRANSPARENT } from "../lib/upload/settings";
import { Marker, change, type SettingsFieldProps } from "./settingsfield";

/** One paint picker's vocabulary: the field, its "none" word, and the handles. */
interface PaintRow {
  field: "background" | "strokeColor";
  label: string;
  /** The `upload-set-<testid>-…` prefix. */
  testid: string;
  none: { value: string; label: string; swatchClass: string };
  hint: string;
}

const BACKGROUND_ROW: PaintRow = {
  field: "background", label: "Background", testid: "bg",
  none: { value: TRANSPARENT, label: "Transparent", swatchClass: "transparent" },
  hint: "transparent = no background in the SVG/EPS; the JPEG flattens onto white",
};

const STROKE_COLOR_ROW: PaintRow = {
  field: "strokeColor", label: "Stroke colour", testid: "stroke-color",
  none: { value: STROKE_COLOR_ARTWORK, label: "Artwork's own", swatchClass: "artwork" },
  hint: "defined once on the file's root — every visible stroke gets it; fills are never touched",
};

export function BackgroundSetting(p: SettingsFieldProps) {
  return <PaintPicker {...p} row={BACKGROUND_ROW} />;
}

export function StrokeColorSetting(p: SettingsFieldProps) {
  return <PaintPicker {...p} row={STROKE_COLOR_ROW} />;
}

/** The none button, the preset swatches, the custom colour, the readout (I-17/I-21). */
// ideal-size: 23 lines reason=one row of JSX — the four controls read as one line of the dialog
function PaintPicker({ p, effective, row }: SettingsFieldProps & { row: PaintRow }) {
  const value = effective[row.field];
  const pick = (next: string) => change(p, row.field, next);
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">{row.label}<Marker p={p} field={row.field} testid={row.testid} /></span>
      <div className="up-bg-row">
        <Swatch id={`${row.testid}-${row.none.swatchClass}`} label={row.none.label} on={value === row.none.value}
          className={row.none.swatchClass} onPick={() => pick(row.none.value)} />
        {BG_PRESETS.map((preset) => (
          <Swatch key={preset.id} id={`${row.testid}-${preset.id}`} label={`${row.label} ${preset.label}`}
            on={value === preset.color} color={preset.color} onPick={() => pick(preset.color)} />
        ))}
        <input type="color" data-testid={`upload-set-${row.testid}-custom`} aria-label={`Custom ${row.label.toLowerCase()}`}
          value={normalizeHex(value) ?? "#000000"}
          onChange={(e) => { const hex = normalizeHex(e.target.value); if (hex !== null) pick(hex); }} />
        <output className="svg-bg-value" data-testid={`upload-set-${row.testid}-value`}>{value}</output>
      </div>
      <small className="up-hint">{row.hint}</small>
    </div>
  );
}

function Swatch({ id, label, on, color, className, onPick }: {
  id: string; label: string; on: boolean; color?: string; className?: string; onPick: () => void;
}) {
  return (
    <button type="button" className={`svg-swatch${className === undefined ? "" : ` ${className}`}${on ? " on" : ""}`}
      data-testid={`upload-set-${id}`} title={label} aria-label={label} aria-pressed={on}
      style={color === undefined ? undefined : { background: color }} onClick={onPick} />
  );
}
