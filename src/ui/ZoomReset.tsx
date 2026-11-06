// ZoomReset.tsx — the small "100 %" button a zoomed preview shows (2026-11-06):
// it says the current zoom and puts the artwork back to 100 %.

import { isZoomed } from "../lib/zoomview";
import type { PreviewZoom } from "./usePreviewZoom";

export default function ZoomReset({ testid, zoom }: { testid: string; zoom: PreviewZoom }) {
  if (!isZoomed(zoom.view)) return null;
  return (
    <button type="button" className="zoom-reset" data-testid={`${testid}-zoom`}
      title="Back to 100 % (Ctrl+Shift + scroll zooms 10–400 %)"
      onClick={(e) => { e.stopPropagation(); zoom.reset(); }}>{Math.round(zoom.view.scale * 100)}% ↺ 100%</button>
  );
}
