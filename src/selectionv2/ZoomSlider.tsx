// ZoomSlider.tsx — the thumbnail zoom control (spec V2 §4): a range slider in
// pixels that replaces fixed S/M/L sizes. It shows the current value, both
// bounds, an accessible label and a visible focus state; the RANGE is the one
// both tabs share (lib/zoom, I-55) and the panel persists the value.

import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomLabel } from "../lib/zoom";

export interface ZoomSliderProps {
  value: number;
  onChange: (px: number) => void;
}

export default function ZoomSlider({ value, onChange }: ZoomSliderProps) {
  return (
    <div className="v2-zoom">
      <label htmlFor="v2-thumb">ZOOM</label>
      <span aria-hidden="true">{ZOOM_MIN}</span>
      <input id="v2-thumb" data-testid="v2-thumb" type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
        value={value} aria-label="Thumbnail maximum height"
        onChange={(e) => onChange(clampZoom(Number(e.target.value)))} />
      <span aria-hidden="true">{ZOOM_MAX}</span>
      <output className="v2-zoom-value" data-testid="v2-thumb-value" htmlFor="v2-thumb">{zoomLabel(value)}</output>
    </div>
  );
}
