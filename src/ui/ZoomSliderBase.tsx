// ZoomSliderBase.tsx — shared zoom slider for Batch and V2, 48-800 via lib/zoom (I-55)
// One owner, both tabs reuse same visual, same range, same clamping.

import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomLabel } from "../lib/zoom";

export interface ZoomSliderBaseProps {
  id: string;
  testid: string;
  value: number;
  onChange: (px: number) => void;
  label?: string;
}

export default function ZoomSliderBase({ id, testid, value, onChange, label = "ZOOM" }: ZoomSliderBaseProps) {
  return (
    <div className="v2-zoom" data-testid={`${testid}-wrap`}>
      <label htmlFor={id}>{label}</label>
      <span aria-hidden="true">{ZOOM_MIN}</span>
      <input
        id={id}
        data-testid={testid}
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={ZOOM_STEP}
        value={value}
        aria-label="Thumbnail maximum height"
        onChange={(e) => onChange(clampZoom(Number(e.target.value)))}
      />
      <span aria-hidden="true">{ZOOM_MAX}</span>
      <output className="v2-zoom-value" data-testid={`${testid}-value`} htmlFor={id}>
        {zoomLabel(value)}
      </output>
    </div>
  );
}
