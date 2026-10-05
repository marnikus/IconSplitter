// ThumbPair.tsx — the two labelled thumbnails every V2 row shows (spec V2 §3).
// The pair shell, the labels and the sizing rule are SHARED with the Generate
// SVG tab (`ui/ThumbPair`, `lib/reviewprefs.thumbBox`): the zoom value is the
// maximum height, the width follows the image's own aspect ratio, and neither
// thumbnail is ever stretched, cropped or allowed to overlap its neighbour. A
// missing side or a decode failure keeps the row and shows a placeholder
// instead of dropping it (RULE 4).

import { useEffect, useState } from "react";
import type { SideRef } from "../lib/pairing";
import { thumbBox, type ThumbSize } from "../lib/reviewprefs";
import type { ViewPair } from "../lib/reviewfilter";
import type { SideThumbFor } from "../selection/thumbs";
import ThumbPairShell, { boxStyle, type ThumbCellSpec } from "../ui/ThumbPair";

export interface Dims {
  w: number;
  h: number;
}

export interface ThumbPairProps {
  row: ViewPair;
  maxH: number;
  thumbFor: SideThumbFor;
  onDims: (d: Dims) => void;
}

export default function ThumbPair(p: ThumbPairProps) {
  const cells: [ThumbCellSpec, ThumbCellSpec] = [
    { tag: "Original", testid: "v2-thumb-src", children: <Thumb p={p} side={p.row.source} label="Original" /> },
    { tag: "AI result", testid: "v2-thumb-ai", children: <Thumb p={p} side={p.row.ai} label="AI result" /> },
  ];
  return <ThumbPairShell cells={cells} />;
}

/** One side: its own box, from the zoom value and that side's natural size. */
function Thumb({ p, side, label }: { p: ThumbPairProps; side: SideRef | null; label: string }) {
  const img = useSideThumb(side, p.thumbFor, p.onDims);
  return <ThumbBody img={img} box={thumbBox(p.maxH, img.natural)} label={label} missing={side === null} />;
}

function ThumbBody({ img, box, label, missing }: {
  img: SideThumb; box: ThumbSize; label: string; missing: boolean;
}) {
  if (missing) return <Placeholder box={box} text={`${label} missing`} />;
  if (img.bad) return <Placeholder box={box} text={`${label} thumbnail failed`} />;
  if (!img.url) return <span className="v2-thumb loading" style={boxStyle(box)} aria-hidden="true" />;
  return <img className="v2-thumb" style={boxStyle(box)} src={img.url} alt={`${label} thumbnail`} onLoad={img.onLoad} />;
}

function Placeholder({ box, text }: { box: ThumbSize; text: string }) {
  return <span className="v2-thumb missing" style={boxStyle(box)} role="img" aria-label={text}>⚠</span>;
}

export interface SideThumb {
  url: string | null;
  bad: boolean;
  /** The decoded side's own pixels; {0,0} while it has not loaded yet. */
  natural: { width: number; height: number };
  onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

const NO_NATURAL = { width: 0, height: 0 };

function useSideThumb(side: SideRef | null, thumbFor: SideThumbFor, onDims: (d: Dims) => void): SideThumb {
  const [url, setUrl] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [natural, setNatural] = useState(NO_NATURAL);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setBad(false);
    setNatural(NO_NATURAL);
    if (!side) return;
    thumbFor(side.relPath).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setBad(true); });
    return () => { alive = false; };
  }, [side, thumbFor]);
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const d = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight };
    setNatural(d);
    if (d.width > 0) onDims({ w: d.width, h: d.height }); // first decoded side supplies the row's dimensions
  };
  return { url, bad, natural, onLoad };
}
