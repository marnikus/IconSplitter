// UploadPreview.tsx — the framed preview of what a row EXPORTS. Mirrors
// svg/SvgThumbs' SVG side: the document is sanitized and fitted by
// lib/svgpreview inside a shadow root (never written back), inside a FRAME whose
// background is the user's preview choice (lib/svgbackground). Since 2026-10-19
// (archive/2026-10-19-upload-default-settings) the document is the live export
// text whenever the settings change anything visual (exportpreview), and the box
// fits the artboard's ratio inside the zoom square (lib/zoom zoomBoxFit): a
// 2048 px or a 16 px artboard draws the same size; a new aspect ratio shows.

import { useMemo } from "react";
import { previewFrame, type PreviewBackground } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import type { UploadSettings } from "../lib/upload/settings";
import { buildSvgPreview } from "../lib/svgpreview";
import { zoomBoxFit } from "../lib/zoom";
import { useSvgText } from "../svg/usesvgtext";
import SvgPreviewBox from "../svg/SvgPreview";
import { useExportPreview } from "./exportpreview";

export interface UploadPreviewProps {
  rootRef: { current: DirHandleLike | null };
  /** Bumped by every pick and scan: no preview may outlive its folder. */
  rootToken: number;
  path: string;
  thumb: number;
  bg: PreviewBackground;
  testid: string;
  label: string;
  version: number;
  /** The row's effective export settings — what the preview shows. */
  settings: UploadSettings;
}

export default function UploadPreview({ rootRef, rootToken, path, thumb, bg, testid, label, version, settings }: UploadPreviewProps) {
  const source = useSvgText(rootRef, rootToken, path);
  const shown = useExportPreview(source, settings);
  const box = useMemo(() => zoomBoxFit(thumb, ratioOf(shown.svg)), [thumb, shown.svg]);
  const frame = previewFrame(bg);
  return (
    <div className={`svg-preview-frame${frame.outline ? " contrast" : ""}`} data-testid={`${testid}-frame`}
      style={{ width: box.width, height: box.height, background: frame.color }} data-bg={frame.color}>
      <SvgPreviewBox code={shown.svg} box={box} testid={testid} label={label} version={version} />
      {shown.note !== null && <small className="up-hint up-prev-note" data-testid={`${testid}-note`}>{shown.note}</small>}
    </div>
  );
}

/** The document's own viewBox ratio; a square until it parses. */
function ratioOf(svg: string | null): number {
  const art = svg === null ? null : buildSvgPreview(svg);
  return art !== null && art.ok ? art.ratio : 1;
}
