// SvgThumbs.tsx — the two previews of one row (prompt §2/§16): the approved AI
// image the generation starts from, and the newest valid SVG beside it. The AI
// side is an object URL cached per path for the session; the SVG side is the
// saved document, rendered INLINE by SvgPreview — parsed, sanitized and fitted
// there, and never written back to disk. It sits in a FRAME whose background
// colour is the user's choice (lib/svgbackground): a CSS background of the
// wrapper, so the document itself is never modified.

import { useEffect, useMemo, useState } from "react";
import { previewFrame, type PreviewBackground, type PreviewFrame } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import { useSideThumbs } from "../selection/thumbs";
import { readSvgText } from "./sidecar";
import { previewTargetOf } from "./rowmodel";
import SvgPreviewBox from "./SvgPreview";
import type { SvgRow } from "./types";

export interface SvgThumbsProps {
  rootRef: { current: DirHandleLike | null };
  /** Bumped by every pick and scan: no preview may outlive its folder. */
  rootToken: number;
  row: SvgRow;
  thumb: number;
  bg: PreviewBackground;
}

export default function SvgThumbs({ rootRef, rootToken, row, thumb, bg }: SvgThumbsProps) {
  const ai = useImageUrl(rootRef, row.source.relPath);
  const target = previewTargetOf(row);
  const svg = useSvgText(rootRef, rootToken, target?.svgPath ?? "");
  const id = row.source.id;
  return (
    <div className="svg-thumbs">
      <Cell tag="AI source">
        <Thumb url={ai} alt={row.source.name} height={thumb} testid={`svg-ai-${id}`} />
      </Cell>
      <Cell tag="Newest SVG" frame={previewFrame(bg)} frameId={`svg-prev-frame-${id}`}>
        <SvgPreviewBox code={svg} size={thumb} testid={`svg-prev-${id}`}
          label={`${row.source.stem} newest SVG`} version={target?.version ?? 0} />
      </Cell>
    </div>
  );
}

/** The label plus whatever it is labelling; the SVG side also carries the
    user's background frame (a CSS colour, never a change to the document). */
function Cell({ tag, children, frame, frameId }: {
  tag: string; children: React.ReactNode; frame?: PreviewFrame; frameId?: string;
}) {
  const className = `svg-thumb-wrap${frame ? " svg-preview-frame" : ""}${frame?.outline ? " contrast" : ""}`;
  return (
    <span className={className} style={frame ? { background: frame.color } : undefined}
      data-testid={frameId} data-bg={frame?.color}>
      {children}
      <span className="svg-thumb-tag">{tag}</span>
    </span>
  );
}

interface ThumbProps {
  url: string | null;
  alt: string;
  height: number;
  testid: string;
}

function Thumb({ url, alt, height, testid }: ThumbProps) {
  // The same square the SVG frame is (RULE 4: both sides of a row are one
  // decision), so the zoom reaches the AI image too — an aspect-driven box with
  // a pixel cap stopped growing while the frame kept growing.
  return url === null
    ? <span className="svg-thumb missing" style={{ width: height, height }} data-testid={testid}>Unreadable</span>
    : <img className="svg-thumb" src={url} alt={alt} width={height} height={height} loading="lazy" data-testid={testid} />;
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

/** Text of the saved SVG the row previews; null when there is none yet. */
function useSvgText(rootRef: { current: DirHandleLike | null }, rootToken: number, relPath: string): string | null {
  const [text, setText] = useState<string | null>(null);
  // The file to read is (folder generation, path): a rescan has to re-read it,
  // or the row would keep painting a version Copy no longer hands out.
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
