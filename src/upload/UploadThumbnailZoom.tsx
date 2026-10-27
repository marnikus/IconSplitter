// The existing SVG-to-upload zoom widget, shared with exported Upload.
import { clampZoom, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, zoomLabel } from "../lib/zoom";

export default function UploadThumbnailZoom({ thumb, onThumb, id = "upload-thumb" }: { thumb: number; onThumb: (px: number) => void; id?: string }) {
  return (
    <div className="svg-zoom">
      <label htmlFor={id}>ZOOM</label>
      <span aria-hidden="true">{ZOOM_MIN}</span>
      <input id={id} data-testid={id} type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
        value={thumb} aria-label="Thumbnail maximum height"
        onChange={(e) => onThumb(clampZoom(Number(e.target.value)))} />
      <span aria-hidden="true">{ZOOM_MAX}</span>
      <output className="svg-zoom-value" data-testid={`${id}-value`} htmlFor={id}>{zoomLabel(thumb)}</output>
    </div>
  );
}
