// BatchZoomSlider.tsx — thumbnail zoom for Batch folders, reuses ZoomSliderBase (shared 48-800)

import ZoomSliderBase from "../ui/ZoomSliderBase";

export interface BatchZoomSliderProps {
  value: number;
  onChange: (px: number) => void;
}

export default function BatchZoomSlider({ value, onChange }: BatchZoomSliderProps) {
  return (
    <div data-testid="batch-zoom">
      <ZoomSliderBase id="batch-thumb" testid="batch-thumb" value={value} onChange={onChange} />
    </div>
  );
}
