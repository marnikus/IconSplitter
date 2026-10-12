// ZoomSlider.tsx — V2 thumbnail zoom, reuses ZoomSliderBase (shared 48-800)

import ZoomSliderBase from "../ui/ZoomSliderBase";

export interface ZoomSliderProps {
  value: number;
  onChange: (px: number) => void;
}

export default function ZoomSlider({ value, onChange }: ZoomSliderProps) {
  return <ZoomSliderBase id="v2-thumb" testid="v2-thumb" value={value} onChange={onChange} />;
}
