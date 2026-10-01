// SvgThumbs.tsx — the two previews of one row (prompt §2): the approved AI
// image the generation starts from, and the newest valid SVG beside it. The AI
// side is an object URL cached per path for the session; the SVG side is the
// saved document, rendered inline by SvgPreview (sanitized, fitted, and never
// written back to disk).

import { useEffect, useMemo, useState } from "react";
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
}

export default function SvgThumbs({ rootRef, rootToken, row, thumb }: SvgThumbsProps) {
  const ai = useImageUrl(rootRef, row.source.relPath);
  const target = previewTargetOf(row);
  const svg = useSvgText(rootRef, rootToken, target?.svgPath ?? "");
  const id = row.source.id;
  return (
    <div className="svg-thumbs">
      <Cell tag="AI source">
        <Thumb url={ai} alt={row.source.name} height={thumb} testid={`svg-ai-${id}`} />
      </Cell>
      <Cell tag="Newest SVG">
        <SvgPreviewBox code={svg} size={thumb} testid={`svg-prev-${id}`}
          label={`${row.source.stem} newest SVG`} version={target?.version ?? 0} />
      </Cell>
    </div>
  );
}

/** The label plus whatever it is labelling, laid out by index.css. */
function Cell({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <span className="svg-thumb-wrap">
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
  return url === null
    ? <span className="svg-thumb missing" style={{ height }} data-testid={testid}>Unreadable</span>
    : <img className="svg-thumb" src={url} alt={alt} height={height} loading="lazy" data-testid={testid} />;
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
