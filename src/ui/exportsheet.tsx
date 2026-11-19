// exportsheet.tsx — THE export-format sheet both export dialogs render
// (2026-11-17): the delivery flags, the EPS writer (with the Inkscape helper
// row), the JPEG resolution + its artboard match and quality, SVGO, the stroke
// and text expansions and the artboard rescale. One component, two flows — the
// SVG to upload dialog wraps it with its inherited/overridden markers and
// write path, the sheet builder wires it straight to its own store — so the
// rows, hints, clamping and the empty-format warning cannot drift apart. The
// `scope` prop is the dialog's test-id prefix (`upload-set` / `bld-set`).
import type { ReactNode } from "react";
import { CONVERTERS, CONVERTER_IDS, parseConverterId } from "../lib/upload/epsconv/registry";
import {
  clampMegapixels, clampQuality, clampRescaleMegapixels, MP_MAX, MP_MIN, QUALITY_MAX, QUALITY_MIN,
} from "../lib/upload/settingsnumbers";
import { hasOutputFormats, NO_OUTPUT_FORMATS } from "../lib/upload/formats";
import { exportArtboardSize, jpegNote, type ExportFormatOptions } from "../lib/exportformats";
import { ExportCheckRow, ExportNumberRow, ExportSelectRow } from "./exportrows";
import EpsHelperRow from "./epshelper";

export interface FormatSheetProps {
  /** Test-id prefix: `upload-set` (SVG to upload) or `bld-set` (sheet builder). */
  scope: string;
  value: ExportFormatOptions;
  patch: (patch: Partial<ExportFormatOptions>) => void;
  /** The artboard the JPEG follows; null = not known (the MP rule alone is named). */
  artboard: { width: number; height: number } | null;
  /** The dialog's inherited/overridden marker, when its flow has one. */
  marker?: (field: keyof ExportFormatOptions, testid: string) => ReactNode;
  /** The upload dialog's "skipped while every visual setting is default" hint. */
  optimizeHint?: string;
}

const HINTS = {
  svg: "unchecked: no SVG file is written or included in the next exported package",
  jpeg: "unchecked: no JPEG is rendered, written or included in the next exported package",
  eps: "a genuine EPS; the converter below writes it, and anything it cannot write fails that stage honestly",
  converter: "who writes the EPS when \"Also write EPS\" is on — the built-in subset writer, or Inkscape on this machine",
  optimize: "the export copy only — viewBox, geometry, strokes and metadata are preserved",
  expand: "strokes become filled shapes (what some stocks require); the SVG, JPEG and EPS all ship without strokes",
  expandText: "text becomes filled glyph outlines; what cannot be outlined fails that stage honestly",
  rescale: "the full artboard keeps its ratio and grows until its area is the megapixel target",
  rescaleMp: "the artboard area in megapixels (1 – 64)",
  rescaleStrokes: "untick and every stroke keeps its printed px while the artboard rescales",
} as const;

/** A row's test id and marker slot under this dialog's scope. */
function rowOf(p: FormatSheetProps, field: keyof ExportFormatOptions, testid: string) {
  return { testid: `${p.scope}-${testid}`, marker: p.marker?.(field, testid) };
}

/** The helper row lives under the flow's own scope: `upload-eps-helper` / `bld-eps-helper`. */
const helperScope = (scope: string) => scope.replace(/-set$/, "");

/**
 * The upload flow has always called its converter row `upload-set-eps-converter`
 * (row line, shipped tests and selector docs); every other row is `<scope>-<row>`.
 */
const converterSuffix = (scope: string) => (scope === "upload-set" ? "eps-converter" : "converter");

/** The delivery flags, the EPS writer and the "nothing is ticked" warning. */
function DeliveryRows(p: FormatSheetProps) {
  return <>
    <ExportCheckRow {...rowOf(p, "includeSvg", "svg")} label="Export SVG" checked={p.value.includeSvg}
      hint={HINTS.svg} onChange={(v) => p.patch({ includeSvg: v })} />
    <ExportCheckRow {...rowOf(p, "includeJpeg", "jpeg")} label="Export JPEG" checked={p.value.includeJpeg}
      hint={HINTS.jpeg} onChange={(v) => p.patch({ includeJpeg: v })} />
    <ExportCheckRow {...rowOf(p, "includeEps", "eps")} label="Also write EPS" checked={p.value.includeEps}
      hint={HINTS.eps} onChange={(v) => p.patch({ includeEps: v })} />
    <ExportSelectRow {...rowOf(p, "epsConverter", converterSuffix(p.scope))} label="EPS converter" value={p.value.epsConverter}
      options={CONVERTER_IDS.map((id) => ({ value: id, label: CONVERTERS[id].label }))}
      hint={HINTS.converter} onChange={(v) => p.patch({ epsConverter: parseConverterId(v) })} />
    {p.value.epsConverter === "inkscape" && <EpsHelperRow scope={helperScope(p.scope)} />}
    {!hasOutputFormats(p.value) && <small className="svg-error" role="alert" data-testid={`${p.scope}-formats-warning`}>{NO_OUTPUT_FORMATS}. The previous package is kept unchanged.</small>}
  </>;
}

/** Typing a resolution also decides against the artboard match (one gesture, one undo entry). */
function megapixelPatch(artboard: FormatSheetProps["artboard"], raw: number): Partial<ExportFormatOptions> {
  const jpegMegapixels = clampMegapixels(raw);
  return artboard === null ? { jpegMegapixels } : { jpegMegapixels, jpegMatchArtboard: false };
}

/** The resolution input, the artboard match box and the note naming the file's real px. */
function JpegPixels(p: FormatSheetProps) {
  const box = p.artboard === null ? null : exportArtboardSize(p.artboard, p.value);
  return (
    <div className="svg-field up-set-field">
      <span className="svg-label">JPEG (MP){p.marker?.("jpegMegapixels", "mp")}</span>
      <input className="svg-input" data-testid={`${p.scope}-mp`} type="number" aria-label="JPEG megapixels"
        min={MP_MIN} max={MP_MAX} step={0.1} value={p.value.jpegMegapixels}
        onChange={(e) => p.patch(megapixelPatch(p.artboard, Number(e.target.value)))} />
      {box !== null && <MatchBox p={p} />}
      <small className="up-hint" data-testid={`${p.scope}-mp-note`}>{jpegNote(box, p.value.jpegMatchArtboard)}</small>
    </div>
  );
}

/** "same size as the artboard": the JPEG is the artboard itself, else the MP above at its ratio. */
function MatchBox({ p }: { p: FormatSheetProps }) {
  return (
    <label className="up-hint up-set-field">
      <input data-testid={`${p.scope}-mp-match`} type="checkbox" aria-label="Same size as the artboard"
        checked={p.value.jpegMatchArtboard} onChange={(e) => p.patch({ jpegMatchArtboard: e.target.checked })} />
      {" same size as the artboard"}
      {p.marker?.("jpegMatchArtboard", "mp-match")}
    </label>
  );
}

/** The JPEG quality. */
function QualityRow(p: FormatSheetProps) {
  return <ExportNumberRow {...rowOf(p, "jpegQuality", "quality")} label="JPEG quality" value={p.value.jpegQuality}
    min={QUALITY_MIN} max={QUALITY_MAX} step={0.01} hint="0.5 – 1"
    onChange={(v) => p.patch({ jpegQuality: clampQuality(v) })} />;
}

/** SVGO and the two expansions. */
function ExpandRows(p: FormatSheetProps) {
  return <>
    <ExportCheckRow {...rowOf(p, "optimizeSvg", "optimize")} label="Optimize SVG (SVGO)" checked={p.value.optimizeSvg}
      hint={p.optimizeHint ?? HINTS.optimize} onChange={(v) => p.patch({ optimizeSvg: v })} />
    <ExportCheckRow {...rowOf(p, "expandStrokes", "expand")} label="Expand strokes to fills" checked={p.value.expandStrokes}
      hint={HINTS.expand} onChange={(v) => p.patch({ expandStrokes: v })} />
    <ExportCheckRow {...rowOf(p, "expandText", "expandtext")} label="Expand text to fills" checked={p.value.expandText}
      hint={HINTS.expandText} onChange={(v) => p.patch({ expandText: v })} />
  </>;
}

/** The full-artboard rescale and its two dependent rows (shown only while its box is ticked). */
function RescaleRows(p: FormatSheetProps) {
  return <>
    <ExportCheckRow {...rowOf(p, "rescaleArtboard", "rescale")} label="Rescale artboard to MP" checked={p.value.rescaleArtboard}
      hint={HINTS.rescale} onChange={(v) => p.patch({ rescaleArtboard: v })} />
    {p.value.rescaleArtboard && <>
      <ExportNumberRow {...rowOf(p, "rescaleMegapixels", "rescale-mp")} label="Rescale target (MP)" value={p.value.rescaleMegapixels}
        min={MP_MIN} max={MP_MAX} step={1} hint={HINTS.rescaleMp}
        onChange={(v) => p.patch({ rescaleMegapixels: clampRescaleMegapixels(v) })} />
      <ExportCheckRow {...rowOf(p, "rescaleStrokes", "rescale-strokes")} label="Scale strokes proportionally" checked={p.value.rescaleStrokes}
        hint={HINTS.rescaleStrokes} onChange={(v) => p.patch({ rescaleStrokes: v })} />
    </>}
  </>;
}

/** Every format row, in the reference sheet's order — drop it into the dialog's grid. */
export function ExportFormatSheet(p: FormatSheetProps) {
  return <>
    <DeliveryRows {...p} />
    <JpegPixels {...p} />
    <QualityRow {...p} />
    <ExpandRows {...p} />
    <RescaleRows {...p} />
  </>;
}
