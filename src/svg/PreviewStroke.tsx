// PreviewStroke.tsx — the pinned bar's preview stroke width (2026-10-19,
// docs/archive/2026-10-19-svg-preview-stroke). One field (0–50 px, empty or the
// word "default") and Reset. Preview only: it drives the shared stylesheet the
// row thumbnails adopt (svg/strokesheet), never a saved file. The field keeps a
// draft so "2." or "abc" can be typed; only a valid value is applied.

import { useEffect, useState } from "react";
import { parseStrokeInput, strokeLabel, STROKE_MAX, STROKE_MIN } from "../lib/previewstroke";
import { applyPreviewStroke } from "./strokesheet";

export interface PreviewStrokeProps {
  stroke: number | null;
  onStroke: (px: number | null) => void;
}

const asText = (px: number | null) => (px === null ? "" : String(px));

export default function PreviewStroke({ stroke, onStroke }: PreviewStrokeProps) {
  const [draft, setDraft] = useState(() => asText(stroke));
  const valid = parseStrokeInput(draft).ok;
  useEffect(() => applyPreviewStroke(stroke), [stroke]);
  useEffect(() => setDraft((d) => (sameValue(d, stroke) ? d : asText(stroke))), [stroke]);
  const edit = (text: string) => {
    setDraft(text);
    const read = parseStrokeInput(text);
    if (read.ok) onStroke(read.px);
  };
  return (
    <div className="svg-stroke" data-testid="svg-stroke-control">
      <label htmlFor="svg-stroke">STROKE</label>
      <input id="svg-stroke" data-testid="svg-stroke" type="text" inputMode="decimal" placeholder="default"
        value={draft} aria-invalid={valid ? undefined : true} aria-label={`Preview stroke width, ${STROKE_MIN}–${STROKE_MAX} px or default`}
        title={`Preview only: every SVG thumbnail drawn with this stroke width (${STROKE_MIN}–${STROKE_MAX} px). Saved files never change.`}
        onChange={(e) => edit(e.target.value)} onBlur={() => setDraft(asText(stroke))} />
      <span aria-hidden="true">px</span>
      <output className="svg-stroke-value" data-testid="svg-stroke-value" htmlFor="svg-stroke">{strokeLabel(stroke)}</output>
      <button type="button" className="svg-btn" data-testid="svg-stroke-reset" disabled={stroke === null}
        title="Back to each SVG file's own stroke widths" onClick={() => { setDraft(""); onStroke(null); }}>Reset</button>
    </div>
  );
}

/** True when the draft already reads as `px` — typing "2." must not be overwritten by "2". */
function sameValue(draft: string, px: number | null): boolean {
  const read = parseStrokeInput(draft);
  return !read.ok || read.px === px;
}
