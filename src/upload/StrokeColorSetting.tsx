// StrokeColorSetting.tsx — the nullable stroke-paint override control: the
// color picker is explicit, and “Original artwork” preserves source paints.

import { normalizeHex } from "../lib/svgbackground";

export interface StrokeColorSettingProps {
  value: string | null;
  marker: string | null;
  onChange: (color: string | null) => void;
}

export default function StrokeColorSetting({ value, marker, onChange }: StrokeColorSettingProps) {
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">
        Stroke color
        {marker !== null && <em className={`up-marker ${marker}`} data-testid="upload-set-marker-stroke-color">{marker}</em>}
      </span>
      <div className="up-bg-row">
        <input type="color" data-testid="upload-set-stroke-color" aria-label="Stroke color"
          value={value ?? "#000000"} onChange={(e) => chooseColor(e.target.value, onChange)} />
        <output className="svg-bg-value" data-testid="upload-set-stroke-color-value">
          {value ?? "Original artwork"}
        </output>
        <button type="button" className="svg-btn tiny" data-testid="upload-set-stroke-original"
          aria-pressed={value === null} onClick={() => onChange(null)}>Original artwork</button>
      </div>
      <small className="up-hint">recolors visible source strokes only; fills and “stroke none” stay unchanged</small>
    </div>
  );
}

function chooseColor(value: string, onChange: (color: string | null) => void): void {
  const color = normalizeHex(value);
  if (color !== null) onChange(color);
}
