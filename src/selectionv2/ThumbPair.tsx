// ThumbPair.tsx — the two labelled thumbnails every V2 row shows (spec V2 §3),
// laid out by the shared PairedThumbs (I-55). Height comes from the one zoom
// rule (lib/zoom), width from the image's own aspect ratio, so a thumbnail is
// never stretched, capped or cropped; a missing side or a decode failure keeps
// the row and shows a placeholder instead of dropping it (RULE 4).

import { useEffect, useState } from "react";
import type { SideRef } from "../lib/pairing";
import { zoomBox } from "../lib/zoom";
import type { ViewPair } from "../lib/reviewfilter";
import PairedThumbs, { type PreviewSlot } from "../ui/PairedThumbs";
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
  const src = useSideThumb(p.row.source, p.thumbFor, p.onDims);
  const ai = useSideThumb(p.row.ai, p.thumbFor, p.onDims);
  return (
    <PairedThumbs slots={[
      slot({ label: "Original", tag: "src", side: p.row.source, img: src, maxH: p.maxH }),
      slot({ label: "AI result", tag: "ai", side: p.row.ai, img: ai, maxH: p.maxH }),
    ]} />
  );
}

/** Everything one slot needs; a slot is a pair of (label, side), nothing more. */
interface SlotArgs {
  label: "Original" | "AI result";
  tag: "src" | "ai";
  side: SideRef | null;
  img: SideThumb;
  maxH: number;
}

function slot({ label, tag, side, img, maxH }: SlotArgs): PreviewSlot {
  const box = zoomBox(maxH, img.natural); // the source's own ratio, never upscaled
  return {
    tag: label, testid: `v2-thumb-${tag}`, width: box.width, height: box.height,
    children: <ThumbBody img={img} label={label} missing={side === null} />,
  };
}

function ThumbBody({ img, label, missing }: { img: SideThumb; label: string; missing: boolean }) {
  if (missing) return <Placeholder text={`${label} missing`} />;
  if (img.bad) return <Placeholder text={`${label} thumbnail failed`} />;
  if (!img.url) return <span className="v2-thumb loading" aria-hidden="true" />;
  return <img className="v2-thumb" src={img.url} alt={`${label} thumbnail`} onLoad={img.onLoad} />;

}

function Placeholder({ text }: { text: string }) {
  return <span className="v2-thumb missing" role="img" aria-label={text}>⚠</span>;
}

export interface SideThumb {
  url: string | null;
  bad: boolean;
  /** Decoded pixel size; 0×0 until the image loads. */
  natural: Dims;
  onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

function useSideThumb(side: SideRef | null, thumbFor: SideThumbFor, onDims: (d: Dims) => void): SideThumb {
  const [url, setUrl] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [natural, setNatural] = useState<Dims>({ w: 0, h: 0 });
  useEffect(() => {
    let alive = true;
    setUrl(null);
    setBad(false);
    setNatural({ w: 0, h: 0 });
    if (!side) return;
    thumbFor(side.relPath).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setBad(true); });
    return () => { alive = false; };
  }, [side, thumbFor]);
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const d = { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight };
    setNatural(d);
    if (d.w > 0) onDims(d); // first decoded side supplies the row's dimensions
  };
  return { url, bad, natural, onLoad };
}
