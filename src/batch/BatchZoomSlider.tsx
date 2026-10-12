// BatchZoomSlider.tsx — thumbnail zoom for Batch folders (spec: V2 controls reference)
// Reuses lib/zoom.ts shared range 48-800 (I-55). Split/export size stays separate.

import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomLabel } from "../lib/zoom";

export interface BatchZoomSliderProps {
  value: number;
  onChange: (px: number) => void;
}

export default function BatchZoomSlider({ value, onChange }: BatchZoomSliderProps) {
  return (
    <div className="v2-zoom" data-testid="batch-zoom">
      <label htmlFor="batch-thumb">ZOOM</label>
      <span aria-hidden="true">{ZOOM_MIN}</span>
      <input
        id="batch-thumb"
        data-testid="batch-thumb"
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={ZOOM_STEP}
        value={value}
        aria-label="Thumbnail maximum height"
        onChange={(e) => onChange(clampZoom(Number(e.target.value)))}
      />
      <span aria-hidden="true">{ZOOM_MAX}</span>
      <output className="v2-zoom-value" data-testid="batch-thumb-value" htmlFor="batch-thumb">
        {zoomLabel(value)}
      </output>
    </div>
  );
}
