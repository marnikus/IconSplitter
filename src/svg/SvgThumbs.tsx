// SvgThumbs.tsx — the two previews of one row (prompt §2/§16): the approved AI
// image the generation starts from, and the SVG version the row owns — the
// preferred one when the user chose one, else the newest valid one. The AI side
// is an object URL cached per path for the session; the SVG side is the saved
// document, rendered INLINE by SvgPreview — parsed, sanitized and fitted there,
// and never written back to disk. The pair shell, its labels and the sizing
// rule are the SHARED ones (ui/ThumbPair, lib/reviewprefs): both previews take
// their height from the one zoom value and their width from their own aspect
// ratio, so the two tabs behave identically and nothing is clipped.
//
// The SVG sits in a FRAME whose background colour is the user's choice
// (lib/svgbackground): a CSS background of the wrapper, so the document itself
// is never modified.

import { useEffect, useState } from "react";
import { thumbBox } from "../lib/reviewprefs";
import { previewFrame, type PreviewBackground, type PreviewFrame } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import { useSideThumbs } from "../selection/thumbs";
import ThumbPairShell, { boxStyle, type ThumbCellSpec } from "../ui/ThumbPair";
import { readSvgText } from "./svgfiles";
import { isPreferredTarget, previewTargetOf } from "./rowmodel";
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
  // The AI box: the shared raster rule (slider height, own ratio, square while
  // the natural size is unknown). The SVG box is sized by SvgPreview itself,
  // from the document's viewBox ratio (a vector has no pixels to protect).
  const cells: [ThumbCellSpec, ThumbCellSpec] = [
    { tag: "AI source", children: <AiThumb ai={ai} maxH={thumb} alt={row.source.name} testid={`svg-ai-${id}`} /> },
    {
      tag: versionTag(target !== null && isPreferredTarget(row), target?.version ?? 0),
      children: (
        <Frame bg={bg} testid={`svg-prev-frame-${id}`}>
          <SvgPreviewBox code={svg} maxH={thumb} testid={`svg-prev-${id}`}
            label={`${row.source.stem} ${target === null ? "" : `v${target.version} `}SVG`} version={target?.version ?? 0} />
        </Frame>
      ),
    },
  ];
  return <ThumbPairShell cells={cells} />;
}

/** The tag names what the second preview really shows (preferred vs newest). */
function versionTag(preferred: boolean, version: number): string {
  if (version === 0) return "No SVG yet";
  if (!preferred) return "Newest SVG";
  return `Preferred v${version}`;
}

/**
 * The user's background colour behind the artwork (preview only — the saved
 * document never sees it), plus the contrast outline a dark frame needs so
 * black strokes stay visible.
 */
function Frame({ bg, testid, children }: { bg: PreviewBackground; testid: string; children: React.ReactNode }) {
  const frame: PreviewFrame = previewFrame(bg);
  const className = `svg-preview-frame${frame.outline ? " contrast" : ""}`;
  return (
    <span className={className} style={{ background: frame.color }} data-testid={testid} data-bg={frame.color}>
      {children}
    </span>
  );
}

interface AiThumbProps {
  ai: AiImage;
  maxH: number;
  alt: string;
  testid: string;
}

/** The AI image in the same box rule as every other raster thumbnail. */
function AiThumb({ ai, maxH, alt, testid }: AiThumbProps) {
  const box = thumbBox(maxH, ai.natural);
  if (ai.url === null) return <span className="svg-thumb missing" style={boxStyle(box)} data-testid={testid}>Unreadable</span>;
  return <img className="svg-thumb" src={ai.url} alt={alt} style={boxStyle(box)} loading="lazy"
    onLoad={ai.onLoad} data-testid={testid} />;
}

interface AiImage {
  url: string | null;
  /** The image's own pixels once decoded, so its box can follow its ratio. */
  natural: { width: number; height: number };
  onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

const NO_NATURAL = { width: 0, height: 0 };

/** Object URL for the AI image, cached for the session (RULE 10). */
function useImageUrl(rootRef: { current: DirHandleLike | null }, relPath: string): AiImage {
  const thumbFor = useSideThumbs(rootRef);
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState(NO_NATURAL);
  useEffect(() => {
    let live = true;
    setNatural(NO_NATURAL);
    thumbFor(relPath).then((u) => live && setUrl(u)).catch(() => live && setUrl(null));
    return () => { live = false; };
  }, [relPath, thumbFor]);
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => setNatural({
    width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight,
  });
  return { url, natural, onLoad };
}

/** Text of the saved SVG the row previews; null when there is none yet. */
function useSvgText(rootRef: { current: DirHandleLike | null }, rootToken: number, relPath: string): string | null {
  const [text, setText] = useState<string | null>(null);
  // The file to read is (folder generation, path): a rescan has to re-read it,
  // or the row would keep painting a version Copy no longer hands out.
  const wanted = { token: rootToken, path: relPath };
  useEffect(() => {
    let live = true;
    const root = rootRef.current;
    setText((prev) => (prev === null ? prev : null));
    if (root !== null && wanted.path !== "") {
      void readSvgText(root, wanted.path).then((t) => live && setText(t), () => live && setText(null));
    }
    return () => { live = false; };
  }, [wanted.token, wanted.path, rootRef]);
  return text;
}
