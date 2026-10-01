// ThumbPair.tsx — the two labelled thumbnails every V2 row shows (spec V2 §3).
// Height comes from the zoom slider, width from the image's own aspect ratio,
// so a thumbnail is never stretched; a missing side or a decode failure keeps
// the row and shows a placeholder instead of dropping it (RULE 4).

import { useEffect, useState } from "react";
import type { SideRef } from "../lib/pairing";
import { thumbHeight } from "../lib/reviewprefs";
import type { ViewPair } from "../lib/reviewfilter";
import type { SideThumbFor } from "../selection/thumbs";

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
  return (
    <div className="v2-thumbs">
      <Thumb side={p.row.source} tag="src" label="Original" maxH={p.maxH} thumbFor={p.thumbFor} onDims={p.onDims} />
      <Thumb side={p.row.ai} tag="ai" label="AI result" maxH={p.maxH} thumbFor={p.thumbFor} onDims={p.onDims} />
    </div>
  );
}

interface ThumbProps {
  side: SideRef | null;
  tag: "src" | "ai";
  label: "Original" | "AI result";
  maxH: number;
  thumbFor: SideThumbFor;
  onDims: (d: Dims) => void;
}

function Thumb(p: ThumbProps) {
  const img = useSideThumb(p.side, p.thumbFor, p.onDims);
  const height = thumbHeight(p.maxH, img.natural);
  return (
    <span className="v2-thumb-wrap" data-testid={`v2-thumb-${p.tag}`}>
      <ThumbBody img={img} height={height} label={p.label} missing={p.side === null} />
      <span className="v2-thumb-tag">{p.label}</span>
    </span>
  );
}

function ThumbBody({ img, height, label, missing }: {
  img: SideThumb; height: number; label: ThumbProps["label"]; missing: boolean;
}) {
  if (missing) return <Placeholder height={height} text={`${label} missing`} />;
  if (img.bad) return <Placeholder height={height} text={`${label} thumbnail failed`} />;
  if (!img.url) return <span className="v2-thumb loading" style={{ height }} aria-hidden="true" />;
  return <img className="v2-thumb" style={{ height }} src={img.url} alt={`${label} thumbnail`} onLoad={img.onLoad} />;
}

function Placeholder({ height, text }: { height: number; text: string }) {
  return <span className="v2-thumb missing" style={{ height }} role="img" aria-label={text}>⚠</span>;
}

export interface SideThumb {
  url: string | null;
  bad: boolean;
  natural: number;
  onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

function useSideThumb(side: SideRef | null, thumbFor: SideThumbFor, onDims: (d: Dims) => void): SideThumb {
  const [url, setUrl] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [natural, setNatural] = useState(0);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setBad(false);
    setNatural(0);
    if (!side) return;
    thumbFor(side.relPath).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setBad(true); });
    return () => { alive = false; };
  }, [side, thumbFor]);
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const d = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
    setNatural(d.h);
    if (d.w > 0) onDims(d); // first decoded side supplies the row's dimensions
  };
  return { url, bad, natural, onLoad };
}
