// SvgThumbs.tsx — the two previews of one row (prompt §2/§16): the approved AI
// image the generation starts from, and the SVG version the row shows beside it.
// The AI side is an object URL cached per path for the session; the SVG side is
// the saved document, rendered INLINE by SvgPreview — parsed, sanitized and
// fitted there, never written back to disk — inside a FRAME whose background
// colour is the user's choice (lib/svgbackground), a CSS background of the
// wrapper, so the document itself is never modified.
//
// The pair is laid out by the shared PairedThumbs and sized by the shared zoom
// rule (I-55), which is what makes this tab and Selection V2 zoom identically:
// each side gets the box its OWN ratio asks for at the slider's height, so
// neither is stretched, capped or cut.

import { useCallback, useEffect, useState } from "react";
import { previewFrame, type PreviewBackground, type PreviewFrame } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import { buildSvgPreview } from "../lib/svgpreview";
import { zoomBox, zoomBoxRatio } from "../lib/zoom";
import { useSideThumbs } from "../selection/thumbs";
import PairedThumbs, { type PreviewSlot } from "../ui/PairedThumbs";
import { useSvgText } from "./usesvgtext";
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

interface Dims {
  w: number;
  h: number;
}

export default function SvgThumbs({ rootRef, rootToken, row, thumb, bg }: SvgThumbsProps) {
  const ai = useImageUrl(rootRef, row.source.relPath);
  const target = previewTargetOf(row);
  const svg = useSvgText(rootRef, rootToken, target?.svgPath ?? "");
  const id = row.source.id;
  const [aiNat, setAiNat] = useState<Dims | null>(null);
  // Both boxes come from the one rule: the raster from its own pixels, the
  // vector from the ratio of the document it is about to draw.
  const aiBox = zoomBox(thumb, aiNat);
  return (
    <PairedThumbs slots={[
      { tag: "AI source", testid: `svg-ai-${id}`, width: aiBox.width, height: aiBox.height,
        children: <Thumb url={ai} alt={row.source.name} testid={`svg-ai-img-${id}`} onDims={setAiNat} /> },
      svgSlot({ svg, thumb, id, stem: row.source.stem, version: target?.version ?? 0, frame: previewFrame(bg) }),
    ]} />
  );
}

/** Everything the SVG side of a row is drawn from — nothing else is read. */
interface SvgSlotArgs {
  svg: string | null;
  thumb: number;
  id: string;
  stem: string;
  version: number;
  frame: PreviewFrame;
}

/** The SVG side: the framed document, in the box its own ratio asks for. */
function svgSlot({ svg, thumb, id, stem, version, frame }: SvgSlotArgs): PreviewSlot {
  const box = svgBox(svg, thumb);
  const className = `svg-preview-frame${frame.outline ? " contrast" : ""}`;
  return {
    tag: version > 0 ? `SVG v${version}` : "SVG",
    testid: `svg-prev-frame-${id}`,
    width: box.width,
    height: box.height,
    className,
    background: frame.color,
    attrs: { "data-bg": frame.color },
    children: <SvgPreviewBox code={svg} box={box} testid={`svg-prev-${id}`}
      label={`${stem} SVG v${version}`} version={version} />,
  };
}

/** The vector's box: its own viewBox ratio at the zoom height, a square until
    the document parses and an empty slot stays honest about it. */
function svgBox(svg: string | null, thumb: number): { width: number; height: number } {
  const art = svg === null ? null : buildSvgPreview(svg);
  return zoomBoxRatio(thumb, art !== null && art.ok ? art.ratio : 1);
}

interface ThumbProps {
  url: string | null;
  alt: string;
  testid: string;
  onDims: (d: Dims) => void;
}

/** The AI source: it reports its own pixels so the pair can size its box. */
function Thumb({ url, alt, testid, onDims }: ThumbProps) {
  const onLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    if (w > 0 && h > 0) onDims({ w, h });
  }, [onDims]);
  return url === null
    ? <span className="svg-thumb missing" data-testid={testid}>Unreadable</span>
    : <img className="svg-thumb" src={url} alt={alt} loading="lazy" onLoad={onLoad} data-testid={testid} />;
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
