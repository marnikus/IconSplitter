// SvgThumbs.tsx — the two previews of one row (prompt §2/§16): the approved AI
// image the generation starts from, and the newest valid SVG beside it. Both
// are resolved from the folder handle, cached per path for the session, and
// the SVG is rendered as an image (svg/preview) so no saved document can
// execute anything in the panel. The SVG preview sits in a FRAME whose
// background colour is the user's choice (lib/svgbackground): the colour is a
// CSS background of the wrapper, so the document itself is never modified.

import { useEffect, useState } from "react";
import { previewFrame, type PreviewBackground } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import { useSideThumbs } from "../selection/thumbs";
import { readSvgText } from "./sidecar";
import { svgPreviewUrl } from "./preview";
import type { SvgRow } from "./types";

export interface SvgThumbsProps {
  rootRef: { current: DirHandleLike | null };
  row: SvgRow;
  thumb: number;
  bg: PreviewBackground;
}

export default function SvgThumbs({ rootRef, row, thumb, bg }: SvgThumbsProps) {
  const ai = useImageUrl(rootRef, row.source.relPath);
  const svgText = useSvgText(rootRef, row.newest?.svgPath ?? "");
  const frame = previewFrame(bg);
  const id = row.source.id;
  return (
    <div className="svg-thumbs">
      <Thumb url={ai} tag="AI source" alt={row.source.name} height={thumb} testid={`svg-ai-${id}`} />
      <Thumb url={svgPreviewUrl(svgText)} tag="Newest SVG" alt={`${row.source.stem} newest SVG`} height={thumb}
        testid={`svg-prev-${id}`} frameId={`svg-prev-frame-${id}`} frame={frame} empty="No SVG" />
    </div>
  );
}

interface ThumbProps {
  url: string | null;
  tag: string;
  alt: string;
  height: number;
  testid: string;
  empty?: string;
  frame?: { color: string; outline: boolean };
  frameId?: string;
}

function Thumb({ url, tag, alt, height, empty, testid, frame, frameId }: ThumbProps) {
  const className = `svg-thumb-wrap${frame ? " svg-preview-frame" : ""}${frame?.outline ? " contrast" : ""}`;
  return (
    <span className={className} style={frame ? { background: frame.color } : undefined}
      data-testid={frameId} data-bg={frame?.color}>
      {url === null
        ? <span className="svg-thumb missing" style={{ height }} data-testid={testid}>{empty ?? "Unreadable"}</span>
        : <img className="svg-thumb" src={url} alt={alt} height={height} loading="lazy" data-testid={testid} />}
      <span className="svg-thumb-tag">{tag}</span>
    </span>
  );
}

/** Object URL for the AI image, cached for the session (RULE 10). */
function useImageUrl(rootRef: { current: DirHandleLike | null }, relPath: string): string | null {
  const thumbFor = useSideThumbs(rootRef);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    thumbFor(relPath).then((u) => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [relPath, thumbFor]);
  return url;
}

/** Text of the saved SVG; null when the row has no version or it is gone. */
function useSvgText(rootRef: { current: DirHandleLike | null }, relPath: string): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const root = rootRef.current;
    if (relPath === "" || root === null) {
      setText(null);
      return;
    }
    readSvgText(root, relPath).then((t) => live && setText(t)).catch(() => live && setText(null));
    return () => { live = false; };
  }, [relPath, rootRef]);
  return text;
}
