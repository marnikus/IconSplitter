// exportrows.tsx — the pure row components BOTH export-settings dialogs share
// (2026-11-17): a checkbox row, a number row and a select row with the upload
// dialog's exact markup, hints below the control and an optional marker slot.
// 2026-11-19: the ROW GROUPS moved here too — the SVG to upload dialog and the
// sheet builder's dialog now render the same delivery, JPEG and transform rows,
// so wording, testids and behaviour cannot drift apart. The two flows differ
// only in the WIRING they pass in (the upload scope's inherited/overridden
// markers vs the builder's own store); the rows themselves are one
// implementation. Field ids stay `{prefix}-{id}`, so `upload-set-*` and
// `bld-set-*` selectors are unchanged.
import type { ReactNode } from "react";
import {
  jpegBoxFor, type ArtboardBox, type ExportFormatOptions,
} from "../lib/exportformats";
import { CONVERTERS, CONVERTER_IDS, parseConverterId } from "../lib/upload/epsconv/registry";
import { hasOutputFormats, NO_OUTPUT_FORMATS } from "../lib/upload/formats";
import { ConverterHelperRow } from "../upload/UploadEpsSettings";
import {
  clampMegapixels, clampQuality, clampRescaleMegapixels, MP_MAX, MP_MIN, QUALITY_MAX, QUALITY_MIN,
} from "../lib/upload/settingsnumbers";

interface RowProps {
  label: string;
  hint: string;
  testid: string;
  marker?: ReactNode;
}

export function ExportCheckRow({ label, hint, testid, marker, checked, onChange }: RowProps & {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="svg-field up-set-field">
      <span className="svg-label">{label}{marker}</span>
      <input data-testid={testid} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <small className="up-hint">{hint}</small>
    </label>
  );
}

export function ExportNumberRow({ label, hint, testid, marker, value, min, max, step, onChange }: RowProps & {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="svg-field up-set-field">
      <span className="svg-label">{label}{marker}</span>
      <input className="svg-input" data-testid={testid} type="number" aria-label={label}
        min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <small className="up-hint">{hint}</small>
    </label>
  );
}

export function ExportSelectRow({ label, hint, testid, marker, value, options, onChange }: RowProps & {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="svg-field up-set-field">
      <span className="svg-label">{label}{marker}</span>
      <select className="svg-input" data-testid={testid} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <small className="up-hint">{hint}</small>
    </label>
  );
}

/**
 * What a row group needs from its flow: the testid prefix, the options and the
 * ONE write path. `marker` is the upload scope's inherited/overridden chip and
 * is absent in the builder, whose store has a single scope.
 */
export interface FormatRowWiring {
  prefix: "upload-set" | "bld-set";
  value: ExportFormatOptions;
  onChange: (patch: Partial<ExportFormatOptions>) => void;
  marker?: (field: keyof ExportFormatOptions, id: string) => ReactNode;
}

const id = (w: FormatRowWiring, name: string) => `${w.prefix}-${name}`;

/** The three delivery flags (SVG / JPEG / EPS), then who writes the EPS. */
export function FormatDeliveryRows({ w }: { w: FormatRowWiring }) {
  const v = w.value;
  return <>
    <ExportCheckRow testid={id(w, "svg")} label="Export SVG" checked={v.includeSvg} marker={w.marker?.("includeSvg", "svg")}
      onChange={(next) => w.onChange({ includeSvg: next })}
      hint="unchecked: no SVG file is written or included in the next exported package" />
    <ExportCheckRow testid={id(w, "jpeg")} label="Export JPEG" checked={v.includeJpeg} marker={w.marker?.("includeJpeg", "jpeg")}
      onChange={(next) => w.onChange({ includeJpeg: next })}
      hint="unchecked: no JPEG is rendered, written or included in the next exported package" />
    <ExportCheckRow testid={id(w, "eps")} label="Also write EPS" checked={v.includeEps} marker={w.marker?.("includeEps", "eps")}
      onChange={(next) => w.onChange({ includeEps: next })}
      hint="a genuine EPS; the converter below writes it, and anything it cannot write fails that stage honestly" />
    <ExportSelectRow testid={id(w, "eps-converter")} label="EPS converter" value={v.epsConverter} marker={w.marker?.("epsConverter", "eps-converter")}
      options={CONVERTER_IDS.map((cid) => ({ value: cid, label: CONVERTERS[cid].label }))}
      onChange={(next) => w.onChange({ epsConverter: parseConverterId(next) })}
      hint={'who writes the EPS when "Also write EPS" is on — the built-in subset writer, or Inkscape on this machine'} />
    {v.epsConverter === "inkscape" && <ConverterHelperRow />}
  </>;
}

/** The "all formats off" alert — one rule, both flows, before any file work. */
export function FormatOffWarning({ w }: { w: FormatRowWiring }) {
  if (hasOutputFormats(w.value)) return null;
  return <small className="svg-error" role="alert" data-testid={id(w, "formats-warning")}>{NO_OUTPUT_FORMATS}. The previous package is kept unchanged.</small>;
}

/** `the JPEG is the artboard itself: 1024×576 px — untick for a bigger file` */
function matchHint(box: ArtboardBox): string {
  return `the JPEG is the artboard itself: ${box.width}×${box.height} px — untick for a bigger file`;
}

const MP_HINT = "rendered from the vectors at this resolution when the box below is unticked";

/**
 * The JPEG resolution: the megapixels, the "same size as the artboard" box and
 * the quality. `artboard` is the composed px the sheet/batch really has; the
 * hint then names the exact file the options spell out (rescale included).
 * `showMatch: false` = the upload scope's artboard hugs the artwork, so the
 * match question does not exist there (`upload_ui` pins that absence).
 */
export function FormatJpegRows({ w, artboard, note, showMatch = true }: {
  w: FormatRowWiring; artboard: ArtboardBox; note?: string; showMatch?: boolean;
}) {
  const v = w.value;
  return <>
    <ExportNumberRow testid={id(w, "mp")} label="JPEG (MP)" value={v.jpegMegapixels} min={MP_MIN} max={MP_MAX} step={0.1}
      marker={w.marker?.("jpegMegapixels", "mp")} onChange={(next) => w.onChange({ jpegMegapixels: clampMegapixels(next) })} hint={MP_HINT} />
    {showMatch && <ExportCheckRow testid={id(w, "mp-match")} label="same size as the artboard" checked={v.jpegMatchArtboard}
      marker={w.marker?.("jpegMatchArtboard", "mp-match")} onChange={(next) => w.onChange({ jpegMatchArtboard: next })}
      hint={note ?? matchHint(jpegBoxFor(v, artboard.width, artboard.height))} />}
    <ExportNumberRow testid={id(w, "quality")} label="JPEG quality" value={v.jpegQuality} min={QUALITY_MIN} max={QUALITY_MAX} step={0.01}
      marker={w.marker?.("jpegQuality", "quality")} onChange={(next) => w.onChange({ jpegQuality: clampQuality(next) })} hint="0.5 – 1" />
  </>;
}

/** SVGO, stroke and text expansion, and the full-artboard rescale with its own two rows. */
export function FormatTransformRows({ w }: { w: FormatRowWiring }) {
  const v = w.value;
  const mark = w.marker;
  return <>
    <ExportCheckRow testid={id(w, "clean")} label="Clean up final SVG and EPS" checked={v.cleanExport} marker={mark?.("cleanExport", "clean")}
      onChange={(next) => w.onChange({ cleanExport: next })}
      hint="strips the generator's fingerprints before saving (data-* attributes, repeated namespaces, float-math junk) and keeps only the title, description and tags as metadata" />
    <ExportCheckRow testid={id(w, "optimize")} label="Optimize SVG (SVGO)" checked={v.optimizeSvg} marker={mark?.("optimizeSvg", "optimize")}
      onChange={(next) => w.onChange({ optimizeSvg: next })}
      hint="the export copy only — viewBox, geometry, strokes and metadata are preserved" />
    <ExportCheckRow testid={id(w, "expand")} label="Expand strokes to fills" checked={v.expandStrokes} marker={mark?.("expandStrokes", "expand")}
      onChange={(next) => w.onChange({ expandStrokes: next })}
      hint="strokes become filled shapes (what some stocks require); the SVG, JPEG and EPS all ship without strokes" />
    <ExportCheckRow testid={id(w, "expandtext")} label="Expand text to fills" checked={v.expandText} marker={mark?.("expandText", "expandtext")}
      onChange={(next) => w.onChange({ expandText: next })}
      hint="text becomes filled glyph outlines in the SVG too; what cannot be outlined fails that stage honestly" />
    <ExportCheckRow testid={id(w, "rescale")} label="Rescale artboard to MP" checked={v.rescaleArtboard} marker={mark?.("rescaleArtboard", "rescale")}
      onChange={(next) => w.onChange({ rescaleArtboard: next })}
      hint="the full artboard keeps its ratio and grows until its area is the megapixel target" />
    {v.rescaleArtboard && <RescaleRows w={w} />}
  </>;
}

/** The rescale's own two rows, shown only while its box is ticked (RULE 10). */
function RescaleRows({ w }: { w: FormatRowWiring }) {
  const v = w.value;
  return <>
    <ExportNumberRow testid={id(w, "rescale-mp")} label="Rescale target (MP)" value={v.rescaleMegapixels} min={MP_MIN} max={MP_MAX} step={1}
      marker={w.marker?.("rescaleMegapixels", "rescale-mp")}
      onChange={(next) => w.onChange({ rescaleMegapixels: clampRescaleMegapixels(next) })}
      hint="the artboard area in megapixels (1 – 64)" />
    <ExportCheckRow testid={id(w, "rescale-strokes")} label="Scale strokes proportionally" checked={v.rescaleStrokes}
      marker={w.marker?.("rescaleStrokes", "rescale-strokes")} onChange={(next) => w.onChange({ rescaleStrokes: next })}
      hint="untick and every stroke keeps its printed px while the artboard rescales" />
  </>;
}
