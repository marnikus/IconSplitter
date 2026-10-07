// UploadPreview.tsx — the framed preview of the approved SVG a row exports.
// Mirrors svg/SvgThumbs' SVG side: the saved document is read, sanitized and
// fitted by lib/svgpreview inside a shadow root (never written back), inside a
// FRAME whose background is the user's preview choice (lib/svgbackground) —
// the document itself is never modified. The box comes from the one zoom rule
// (lib/zoom), so this tab zooms exactly like Generate SVG (I-55).

import { useEffect, useMemo, useState } from "react";
import { previewFrame, type PreviewBackground } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import { buildSvgPreview } from "../lib/svgpreview";
import { zoomBoxRatio } from "../lib/zoom";
import { readSvgText } from "../svg/svgfiles";
import SvgPreviewBox from "../svg/SvgPreview";

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
}

export default function UploadPreview({ rootRef, rootToken, path, thumb, bg, testid, label, version }: UploadPreviewProps) {
  const svg = useSvgText(rootRef, rootToken, path);
  const box = useMemo(() => zoomBoxRatio(thumb, ratioOf(svg)), [thumb, svg]);
  const frame = previewFrame(bg);
  return (
    <div className={`svg-preview-frame${frame.outline ? " contrast" : ""}`} data-testid={`${testid}-frame`}
      style={{ width: box.width, height: box.height, background: frame.color }} data-bg={frame.color}>
      <SvgPreviewBox code={svg} box={box} testid={testid} label={label} version={version} />
    </div>
  );
}

/** The vector's own viewBox ratio; a square until the document parses. */
function ratioOf(svg: string | null): number {
  const art = svg === null ? null : buildSvgPreview(svg);
  return art !== null && art.ok ? art.ratio : 1;
}

/** Text of the saved SVG the row previews; null when there is none yet. */
function useSvgText(rootRef: { current: DirHandleLike | null }, rootToken: number, relPath: string): string | null {
  const [text, setText] = useState<string | null>(null);
  // The file to read is (folder generation, path): a rescan has to re-read it.
  const wanted = useMemo(() => ({ token: rootToken, path: relPath }), [rootToken, relPath]);
  useEffect(() => {
    let live = true;
    const root = rootRef.current;
    setText((prev) => (prev === null ? prev : null));
    if (root !== null && wanted.path !== "") {
      void readSvgText(root, wanted.path).then((t) => live && setText(t), () => live && setText(null));
    }
    return () => { live = false; };
  }, [wanted, rootRef]);
  return text;
}
