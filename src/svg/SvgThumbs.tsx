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
// neither is stretched, capped or cut. Under the previews sits one strip with
// ONE cell per preview slot, in the slots' own order and width (2026-11-17):
// the AI-source strip (AiSourceBar, 2026-10-19: in flight, version chips, last
// failure) under the AI-source preview it switches, the SVG bar (Edit + the
// SVG version chips, 2026-10-19, archive/2026-10-19-svg-version-chips — one
// click shows that version, through the same preferVersion owner as the
// Versions dialog) under the SVG preview, and an empty cell where a Base ·
// Stroke preview has no versions of its own — a chip set can never land under
// a preview it does not belong to, whatever the number of previews.

import { aiCorner, Corner, mainVersionOf, svgCorner } from "./previewtrash";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { previewFrame, type PreviewBackground, type PreviewFrame } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import { buildSvgPreview, type SvgPreview } from "../lib/svgpreview";
import { zoomBox, zoomBoxRatio } from "../lib/zoom";
import PairedThumbs, { type PreviewSlot } from "../ui/PairedThumbs";
import { lastImageFailure, mainImageOf } from "../lib/svgimgreg";
import { useSvgText } from "./usesvgtext";
import { useImageUrl } from "./useimageurl";
import { previewTargetOf, shownVersion } from "./rowmodel";
import SvgPreviewBox from "./SvgPreview";
import { editBlocked, PairBars, svgBarOf } from "./svgeditslot";
import { openSvgEditor } from "./pathedit/editmodalstore";
import { SVG_STROKE_SHEET } from "./strokesheet";
import type { SvgRow } from "./types";
import { useRowTailMarks } from "./tailcut/tailreview";
import { useCutSettings } from "./tailcut/cutsettings";
import type { TailMarks } from "./tailcut/tailmarks";

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

function SvgThumbsView({ rootRef, rootToken, row, thumb, bg, aiActions, onPreferSvg }: SvgThumbsProps) {
  // The AI side shows the MAIN image — the same file the SVG generation reads (RC8).
  const ai = useImageUrl(rootRef, mainImageOf(row.meta, row.source.relPath));
  const baseAi = useImageUrl(rootRef, row.baseAiPath ?? "");
  const target = useMemo(() => previewTargetOf(row), [row]);
  const svg = useSvgText(rootRef, rootToken, target?.svgPath ?? "");
  const art = useMemo(() => (svg === null ? null : buildSvgPreview(svg)), [svg]);
  const id = row.source.id;
  const [aiNat, setAiNat] = useState<Dims | null>(null);
  const aiBox = zoomBox(thumb, aiNat);
  const { review, marks } = useRowTailMarks(id, target?.svgPath ?? "", svg, useCutSettings());
  const canEdit = useMemo(() => editBlocked(row, svg) === null, [row, svg]);
  const onOpen = useMemo(() => (canEdit ? () => openSvgEditor(id) : undefined), [canEdit, id]);
  const frame = useMemo(() => previewFrame(bg), [bg]);
  const svgSide = svgSlot({ svg, art, thumb, id, stem: row.source.stem, version: target?.version ?? 0, frame, marks, onOpen, trash: svgCorner(target, id) });
  const aiBar = useMemo(() => (aiActions === undefined ? null : <AiSourceBar row={row} ai={aiActions} />), [row, aiActions]);
  const svgBar = useMemo(
    () => svgBarOf(row, svg, onPreferSvg === undefined ? null : <SvgVersionChips row={row} onPrefer={onPreferSvg} />, review),
    [row, svg, onPreferSvg, review],
  );
  const sides: PreviewSide[] = [...(row.baseAiPath ? [baseSide(row, id, aiBox, baseAi)] : []),
    aiSide({ row, id, box: aiBox, url: ai, onDims: setAiNat, bar: aiBar }),
    { slot: svgSide, bar: svgBar }];
  return (
    <div className="svg-pair-with-bar">
      <PairedThumbs slots={sides.map((s) => s.slot)} />
      <PairBars cells={sides.map((s) => ({ width: s.slot.width, children: s.bar }))} />
    </div>
  );
}

export default memo(SvgThumbsView);

/** A preview slot together with the bar cell that sits under it. */
interface PreviewSide {
  slot: PreviewSlot;
  /** The strip under this preview; null = this preview has no versions to switch. */
  bar: ReactNode;
}

/** The Base · Stroke side: the base line-stroke image, no versions of its own. */
function baseSide(row: SvgRow, id: string, box: { width: number; height: number }, url: string | null): PreviewSide {
  return {
    slot: { tag: "Base · Stroke", testid: `svg-base-ai-${id}`, width: box.width, height: box.height,
      children: <><Thumb url={url} alt={`${row.source.name} (base)`} testid={`svg-base-ai-img-${id}`} onDims={() => {}} />
        <Corner id={id} side="base" /></> },
    bar: null,
  };
}

/** Everything the AI source side of a row is drawn from. */
interface AiSideArgs {
  row: SvgRow;
  id: string;
  box: { width: number; height: number };
  url: string | null;
  /** Reports the raster's own pixel size, which sets the box. */
  onDims: (d: Dims | null) => void;
  bar: ReactNode;
}

/** The AI source side: the main image, with the corner 🗑 of the accepted regeneration. */
function aiSide({ row, id, box, url, onDims, bar }: AiSideArgs): PreviewSide {
  return {
    slot: { tag: "AI source", testid: `svg-ai-${id}`, width: box.width, height: box.height,
      children: <><Thumb url={url} alt={row.source.name} testid={`svg-ai-img-${id}`} onDims={onDims} />
        {url !== null && <Corner id={id} side="ai" trash={aiCorner(row.meta, id)} />}</> },
    bar,
  };
}

/** Everything the SVG side of a row is drawn from — nothing else is read. */
interface SvgSlotArgs {
  svg: string | null;
  art: SvgPreview | null;
  thumb: number;
  id: string;
  stem: string;
  version: number;
  frame: PreviewFrame;
  /** Tail-cutter highlights while a review is open (preview only). */
  marks?: TailMarks;
  /** Double-click opens the SVG edit mode; absent when this row cannot be edited now. */
  onOpen?: () => void;
  /** The corner 🗑 for the shown version; absent when the preview has none. */
  trash?: ReactNode;
}

/** The SVG side: the framed document, in the box its own ratio asks for. */
function svgSlot({ svg, art, thumb, id, stem, version, frame, marks, onOpen, trash }: SvgSlotArgs): PreviewSlot {
  const box = svgBox(art, thumb);
  const className = `svg-preview-frame${frame.outline ? " contrast" : ""}`;
  return {
    tag: version > 0 ? `SVG v${version}` : "SVG",
    testid: `svg-prev-frame-${id}`,
    width: box.width,
    height: box.height,
    className,
    background: frame.color,
    attrs: { "data-bg": frame.color },
    children: (
      <div className="svg-open-edit" style={{ display: "contents" }} title={onOpen ? "Double-click to edit" : undefined}
        onDoubleClick={(e) => { if (onOpen) { e.stopPropagation(); onOpen(); } }}>
        <SvgPreviewBox code={svg} preview={art ?? undefined} box={box} testid={`svg-prev-${id}`} marks={marks}
      label={`${stem} SVG v${version}`} version={version} strokeSheet={SVG_STROKE_SHEET} />
        <Corner id={id} side="svg" trash={trash} />
      </div>
    ),
  };
}

/** The vector's box: its own viewBox ratio at the zoom height, a square until
    the document parses and an empty slot stays honest about it. */
function svgBox(art: SvgPreview | null, thumb: number): { width: number; height: number } {
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
  const main = mainVersionOf(row.meta);
  const chip = (key: string, text: string, version: number | null) => (
    <button key={key} type="button" className={`svg-btn tiny${main === version ? " primary" : ""}`}
      data-testid={`svg-ai-chip-${id}-${key}`} data-active={main === version ? "true" : "false"}
      title={main === version ? "Accept this version as the AI source" : "Accept and use this version as the AI source"}
      onClick={(e) => { e.stopPropagation(); onMain(id, version); }}>{text}</button>
  );
  return <>{chip("orig", "original", null)}{versions.map((v) => chip(String(v.version), `v${v.version}`, v.version))}</>;
}

/**
 * The SVG version chips under the SVG preview (2026-10-19): one per version
 * that can be shown (generated + valid), the shown one marked. A click is the
 * Versions dialog's "Use this version" in one step — same owner, same toast,
 * same pair-file write, and just like it a CHOICE: the row stays as approved or
 * unapproved as it was. One usable version has nothing to switch to: no chips.
 */
function SvgVersionChips({ row, onPrefer }: { row: SvgRow; onPrefer: (id: string, version: number) => void }) {
  const usable = (row.meta?.versions ?? []).filter((v) => v.status === "generated" && v.validation.ok);
  if (usable.length < 1) return null; // the 🗑 lives on the preview corner, not here (2026-11-17)
  const id = row.source.id;
  const shown = shownVersion(row)?.version ?? null;
  return (
    <div className="svg-ai-bar" data-testid={`svg-ver-bar-${id}`}>
      {usable.map(({ version }) => {
        const on = version === shown;
        // The stored choice, not the approval: choosing never approves the row.
        const chosen = row.meta?.preferred === version;
        return (
          <button key={version} type="button" className={`svg-btn tiny${on ? " primary" : ""}`}
            data-testid={`svg-ver-chip-${id}-${version}`} data-active={on ? "true" : "false"} aria-pressed={on}
            title={chosen ? "This SVG version is the one the row shows and exports" : "Show this SVG version — choosing does not approve the row"}
            onClick={(e) => { e.stopPropagation(); if (!chosen) onPrefer(id, version); }}>v{version}</button>
        );
      })}
    </div>
  );
}

