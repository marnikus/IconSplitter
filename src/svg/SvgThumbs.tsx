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
// neither is stretched, capped or cut. Under the pair sits one strip of two
// cells, each as wide as the preview above it: the AI-source strip (AiSourceBar,
// 2026-10-19: in flight, version chips, last failure) and the SVG version chips
// (2026-10-19, archive/2026-10-19-svg-version-chips) — one click shows that
// version, through the same preferVersion owner as the Versions dialog.

import { useCallback, useEffect, useState } from "react";
import { previewFrame, type PreviewBackground, type PreviewFrame } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import { buildSvgPreview } from "../lib/svgpreview";
import { zoomBox, zoomBoxRatio } from "../lib/zoom";
import { useSideThumbs } from "../selection/thumbs";
import PairedThumbs, { type PreviewSlot } from "../ui/PairedThumbs";
import { lastImageFailure, mainImageOf } from "../lib/svgimgreg";
import { useSvgText } from "./usesvgtext";
import { previewTargetOf, shownVersion } from "./rowmodel";
import SvgPreviewBox from "./SvgPreview";
import type { SvgRow } from "./types";

export interface SvgThumbsProps {
  rootRef: { current: DirHandleLike | null };
  /** Bumped by every pick and scan: no preview may outlive its folder. */
  rootToken: number;
  row: SvgRow;
  thumb: number;
  bg: PreviewBackground;
  /** The AI-source strip's actions; absent = no strip under the pair. */
  aiActions?: AiBarActions;
  /** Shows a recorded SVG version (the dialog's preferVersion); absent = no SVG chips. */
  onPreferSvg?: (id: string, version: number) => void;
}

interface Dims {
  w: number;
  h: number;
}

export default function SvgThumbs({ rootRef, rootToken, row, thumb, bg, aiActions, onPreferSvg }: SvgThumbsProps) {
  // The AI side shows the MAIN image — the same file the SVG generation reads (RC8).
  const ai = useImageUrl(rootRef, mainImageOf(row.meta, row.source.relPath));
  const target = previewTargetOf(row);
  const svg = useSvgText(rootRef, rootToken, target?.svgPath ?? "");
  const id = row.source.id;
  const [aiNat, setAiNat] = useState<Dims | null>(null);
  // Both boxes come from the one rule: the raster from its own pixels, the
  // vector from the ratio of the document it is about to draw.
  const aiBox = zoomBox(thumb, aiNat);
  const svgSide = svgSlot({ svg, thumb, id, stem: row.source.stem, version: target?.version ?? 0, frame: previewFrame(bg) });
  const aiBar = aiActions === undefined ? null : <AiSourceBar row={row} ai={aiActions} />;
  const svgBar = onPreferSvg === undefined ? null : <SvgVersionChips row={row} onPrefer={onPreferSvg} />;
  return (
    <div className="svg-pair-with-bar">
      <PairedThumbs slots={[
      { tag: "AI source", testid: `svg-ai-${id}`, width: aiBox.width, height: aiBox.height,
        children: <Thumb url={ai} alt={row.source.name} testid={`svg-ai-img-${id}`} onDims={setAiNat} /> },
      svgSide,
    ]} />
      {(aiBar !== null || svgBar !== null) && (
        <div className="svg-pair-bars">
          <div className="svg-pair-bar" style={{ width: `${aiBox.width}px` }}>{aiBar}</div>
          <div className="svg-pair-bar" style={{ width: `${svgSide.width}px` }}>{svgBar}</div>
        </div>
      )}
    </div>
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
      label={`${stem} SVG v${version}`} version={version} strokeOverride />,
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

/** What the AI-source strip shows and does for its row (wired from the panel's actions). */
interface AiBarActions {
  /** The row's AI image is being regenerated right now (svg/imgactions). */
  running: boolean;
  onMain: (id: string, version: number | null) => void;
}

/**
 * The AI-source strip under the pair (2026-10-19): the in-flight marker, the
 * version chips that pick the MAIN image (the I-54 switch) and the last
 * attempt's failure, read from the pair file — beside the image they are
 * about, INSIDE the pair cell (the row keeps exactly the cells its grid
 * declares; the "◍ Regenerate image" action lives in the decision cell).
 * Nothing to show = no strip.
 */
function AiSourceBar({ row, ai }: { row: SvgRow; ai: AiBarActions }) {
  const strip = stripOf(row, ai.running);
  if (strip === null) return null;
  const id = row.source.id;
  return (
    <div className="svg-ai-bar" data-testid={`svg-ai-bar-${id}`}>
      {ai.running && (
        <span className="svg-progress-mini" data-testid={`svg-ai-running-${id}`} role="progressbar"
          aria-label="Regenerating the AI source image"><span /></span>
      )}
      <VersionChips row={row} onMain={ai.onMain} />
      {strip.failure !== null && (
        <small className="svg-error" data-testid={`svg-ai-error-${id}`} title={strip.failure}>Last image attempt failed: {strip.failure}</small>
      )}
    </div>
  );
}

/** What the strip has to show — null when nothing is in flight, chosen or failed. */
function stripOf(row: SvgRow, running: boolean): { failure: string | null } | null {
  const versions = row.meta?.imageVersions ?? [];
  const failure = running ? null : lastImageFailure(versions);
  const chips = versions.some((v) => v.status === "done");
  return running || chips || failure !== null ? { failure } : null;
}

/** Original + every done regeneration, the main one marked; a click makes that version MAIN. */
function VersionChips({ row, onMain }: { row: SvgRow; onMain: AiBarActions["onMain"] }) {
  const versions = row.meta?.imageVersions.filter((v) => v.status === "done") ?? [];
  if (versions.length === 0) return null;
  const id = row.source.id;
  const preferred = row.meta?.imagePreferred ?? null;
  // the same rule as svgimgreg.mainImageOf: a pointer to no done version means the original
  const main = versions.some((v) => v.version === preferred) ? preferred : null;
  const chip = (key: string, text: string, version: number | null) => (
    <button key={key} type="button" className={`svg-btn tiny${main === version ? " primary" : ""}`}
      data-testid={`svg-ai-chip-${id}-${key}`} data-active={main === version ? "true" : "false"}
      title={main === version ? "This version is the AI source" : "Use this version as the AI source"}
      onClick={(e) => { e.stopPropagation(); onMain(id, version); }}>{text}</button>
  );
  return <>{chip("orig", "original", null)}{versions.map((v) => chip(String(v.version), `v${v.version}`, v.version))}</>;
}

/**
 * The SVG version chips under the SVG preview (2026-10-19): one per version
 * that can be shown (generated + valid), the shown one marked. A click is the
 * Versions dialog's "Use this version" in one step — same owner, same toast,
 * same pair-file write. One usable version has nothing to switch to: no chips.
 */
function SvgVersionChips({ row, onPrefer }: { row: SvgRow; onPrefer: (id: string, version: number) => void }) {
  const usable = (row.meta?.versions ?? []).filter((v) => v.status === "generated" && v.validation.ok);
  if (usable.length < 2) return null;
  const id = row.source.id;
  const shown = shownVersion(row)?.version ?? null;
  return (
    <div className="svg-ai-bar" data-testid={`svg-ver-bar-${id}`}>
      {usable.map(({ version }) => {
        const on = version === shown;
        return (
          <button key={version} type="button" className={`svg-btn tiny${on ? " primary" : ""}`}
            data-testid={`svg-ver-chip-${id}-${version}`} data-active={on ? "true" : "false"} aria-pressed={on}
            title={on ? "This SVG version is shown" : "Show this SVG version"}
            onClick={(e) => { e.stopPropagation(); if (!on) onPrefer(id, version); }}>v{version}</button>
        );
      })}
    </div>
  );
}
