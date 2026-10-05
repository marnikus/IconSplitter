// ZoomSlider.tsx — the ONE thumbnail zoom control (2026-10-05). Selection V2
// and Generate SVG render this component, so both tabs share one range
// (48–800 px), one step, both bounds, one live readout and one accessible
// label; a caller supplies its own id (also the testid) and class, so each tab
// keeps its own styling and persisted value while the behaviour cannot drift.
// Clamping lives in lib/reviewprefs — the single owner of the range.

import { clampThumb, THUMB_MAX, THUMB_MIN, THUMB_STEP, thumbLabel } from "../lib/reviewprefs";

export interface ZoomSliderProps {
  /** The slider's id: it is the input's testid too, its readout's `<id>-value`. */
  id: string;
  value: number;
  /** The surface's wrapper class; its value chip is `<className>-value`. */
  className: string;
  onChange: (px: number) => void;
}

export default function ZoomSlider({ id, value, className, onChange }: ZoomSliderProps) {
  return (
    <div className={className}>
      <label htmlFor={id}>ZOOM</label>
      <span aria-hidden="true">{THUMB_MIN}</span>
      <input id={id} data-testid={id} type="range" min={THUMB_MIN} max={THUMB_MAX} step={THUMB_STEP}
        value={value} aria-label="Thumbnail maximum height"
        onChange={(e) => onChange(clampThumb(Number(e.target.value)))} />
      <span aria-hidden="true">{THUMB_MAX}</span>
      <output className={`${className}-value`} data-testid={`${id}-value`} htmlFor={id} title="Maximum height of both previews">
        {thumbLabel(value)}
      </output>
    </div>
  );
}
