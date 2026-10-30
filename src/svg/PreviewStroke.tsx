// PreviewStroke.tsx — a bulk bar's preview stroke width (2026-10-19,
// docs/archive/2026-10-19-svg-preview-stroke; reused by SVG to upload,
// archive/2026-10-19-upload-preview-stroke). One field (0–50 px, empty or the
// word "default") and Reset. On Generate SVG it is preview only: it drives the
// tab's shared stylesheet its row thumbnails adopt (svg/strokesheet). On SVG to
// upload it IS the export stroke width (no sheet; archive/2026-10-19-upload-default-settings).
// The field keeps a draft so "2." or "abc" can be typed; only a valid value is applied.

import { useEffect, useState } from "react";
import { parseStrokeInput, strokeLabel, STROKE_MAX, STROKE_MIN } from "../lib/previewstroke";
import type { StrokeSheet } from "./strokesheet";

export interface PreviewStrokeProps {
  stroke: number | null;
  onStroke: (px: number | null) => void;
  /** The tab's preview sheet (SVG_STROKE_SHEET); absent = the value is not a preview override. */
  sheet?: StrokeSheet;
  /** The field's tooltip — what the number does on this tab. */
  title?: string;
  /** Test-id prefix: `{prefix}-stroke`, `-stroke-value`, `-stroke-reset`. */
  idPrefix: "svg" | "upload";
}

const asText = (px: number | null) => (px === null ? "" : String(px));

const PREVIEW_TITLE = `Preview only: every SVG thumbnail drawn with this stroke width (${STROKE_MIN}–${STROKE_MAX} px). Saved files never change.`;

export default function PreviewStroke({ stroke, onStroke, sheet, idPrefix, title = PREVIEW_TITLE }: PreviewStrokeProps) {
  const [draft, setDraft] = useState(() => asText(stroke));
  const valid = parseStrokeInput(draft).ok;
  useEffect(() => sheet?.apply(stroke), [sheet, stroke]);
  useEffect(() => setDraft((d) => (sameValue(d, stroke) ? d : asText(stroke))), [stroke]);
  const edit = (text: string) => {
    setDraft(text);
    const read = parseStrokeInput(text);
    if (read.ok) onStroke(read.px);
  };
  return (
    <div className="svg-stroke" data-testid={`${idPrefix}-stroke-control`}>
      <label htmlFor={`${idPrefix}-stroke`}>STROKE</label>
      <input id={`${idPrefix}-stroke`} data-testid={`${idPrefix}-stroke`} type="text" inputMode="decimal" placeholder="default"
        value={draft} aria-invalid={valid ? undefined : true} aria-label={`Preview stroke width, ${STROKE_MIN}–${STROKE_MAX} px or default`}
        title={title}
        onChange={(e) => edit(e.target.value)} onBlur={() => setDraft(asText(stroke))} />
      <span aria-hidden="true">px</span>
      <output className="svg-stroke-value" data-testid={`${idPrefix}-stroke-value`} htmlFor={`${idPrefix}-stroke`}>{strokeLabel(stroke)}</output>
      <button type="button" className="svg-btn" data-testid={`${idPrefix}-stroke-reset`} disabled={stroke === null}
        title="Back to each SVG file's own stroke widths" onClick={() => { setDraft(""); onStroke(null); }}>Reset</button>
    </div>
  );
}

/** True when the draft already reads as `px` — typing "2." must not be overwritten by "2". */
function sameValue(draft: string, px: number | null): boolean {
  const read = parseStrokeInput(draft);
  return !read.ok || read.px === px;
}
