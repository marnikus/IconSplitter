// ZoomSlider.tsx — the thumbnail zoom control (spec V2 §4): a range slider in
// pixels that replaces fixed S/M/L sizes. It shows the current value, both
// bounds, an accessible label and a visible focus state; the value is clamped
// by lib/reviewprefs and persisted by the panel.

import { clampThumb, THUMB_MAX, THUMB_MIN, THUMB_STEP, thumbLabel } from "../lib/reviewprefs";

export interface ZoomSliderProps {
  value: number;
  onChange: (px: number) => void;
}

export default function ZoomSlider({ value, onChange }: ZoomSliderProps) {
  return (
    <div className="v2-zoom">
      <label htmlFor="v2-thumb">ZOOM</label>
      <span aria-hidden="true">{THUMB_MIN}</span>
      <input id="v2-thumb" data-testid="v2-thumb" type="range" min={THUMB_MIN} max={THUMB_MAX} step={THUMB_STEP}
        value={value} aria-label="Thumbnail maximum height"
        onChange={(e) => onChange(clampThumb(Number(e.target.value)))} />
      <span aria-hidden="true">{THUMB_MAX}</span>
      <output className="v2-zoom-value" data-testid="v2-thumb-value" htmlFor="v2-thumb">{thumbLabel(value)}</output>
    </div>
  );
}
