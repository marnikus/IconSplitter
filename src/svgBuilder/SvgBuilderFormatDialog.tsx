// SvgBuilderFormatDialog.tsx — the builder's Export settings dialog
// (2026-11-17): the SAME rows, hints and markup the upload dialog shows, over
// the builder's own persisted options (formatstore). Every gesture saves at
// once (RULE 24); the stock package and its JPEG/EPS stages read exactly these
// options (sheetpackage.ts). Pure rows live in ui/exportrows.tsx so the two
// dialogs cannot drift apart.
import { useState } from "react";
import { CONVERTERS, CONVERTER_IDS, parseConverterId } from "../lib/upload/epsconv/registry";
import {
  clampMegapixels, clampQuality, clampRescaleMegapixels, MP_MAX, MP_MIN, QUALITY_MAX, QUALITY_MIN,
} from "../lib/upload/settings";
import { type ExportFormatOptions } from "../lib/exportformats";
import { ExportCheckRow, ExportNumberRow, ExportSelectRow } from "../ui/exportrows";
import { loadBuilderFormats, saveBuilderFormats } from "./formatstore";
import type { BuilderApi } from "./useSvgBuilder";

interface Props {
  value: ExportFormatOptions;
  onPatch: (patch: Partial<ExportFormatOptions>) => void;
  onClose: () => void;
}

/** The delivery flags and the EPS converter choice. */
function DeliveryRows({ value, onPatch }: Omit<Props, "onClose">) {
  return <>
        <ExportCheckRow testid="bld-set-svg" label="Export SVG" checked={value.includeSvg} onChange={(v) => onPatch({ includeSvg: v })}
          hint="unchecked: no SVG file is written or included in the next exported package" />
        <ExportCheckRow testid="bld-set-jpeg" label="Export JPEG" checked={value.includeJpeg} onChange={(v) => onPatch({ includeJpeg: v })}
          hint="unchecked: no JPEG is rendered, written or included in the next exported package" />
        <ExportCheckRow testid="bld-set-eps" label="Also write EPS" checked={value.includeEps} onChange={(v) => onPatch({ includeEps: v })}
          hint="a genuine EPS; the converter below writes it, and anything it cannot write fails that stage honestly" />
        <ExportSelectRow testid="bld-set-converter" label="EPS converter" value={value.epsConverter}
          options={CONVERTER_IDS.map((id) => ({ value: id, label: CONVERTERS[id].label }))}
          onChange={(v) => onPatch({ epsConverter: parseConverterId(v) })}
          hint="who writes the EPS when &quot;Also write EPS&quot; is on — the built-in subset writer, or Inkscape on this machine" />
        <ExportNumberRow testid="bld-set-mp" label="JPEG (MP)" value={value.jpegMegapixels} min={MP_MIN} max={MP_MAX} step={0.1}
          onChange={(v) => onPatch({ jpegMegapixels: clampMegapixels(v) })}
          hint="rendered from the vectors at this resolution when the box below is unticked" />
        <ExportCheckRow testid="bld-set-mp-match" label="same size as the artboard" checked={value.jpegMatchArtboard}
          onChange={(v) => onPatch({ jpegMatchArtboard: v })}
          hint="the JPEG is the artboard itself — untick for a bigger file" />
        <ExportNumberRow testid="bld-set-quality" label="JPEG quality" value={value.jpegQuality} min={QUALITY_MIN} max={QUALITY_MAX} step={0.01}
          onChange={(v) => onPatch({ jpegQuality: clampQuality(v) })} hint="0.5 – 1" />
  </>;
}

/** The JPEG resolution, its artboard match and its quality. */
function JpegRows({ value, onPatch }: Omit<Props, "onClose">) {
  return <>
    <ExportNumberRow testid="bld-set-mp" label="JPEG (MP)" value={value.jpegMegapixels} min={MP_MIN} max={MP_MAX} step={0.1}
      onChange={(v) => onPatch({ jpegMegapixels: clampMegapixels(v) })}
      hint="rendered from the vectors at this resolution when the box below is unticked" />
    <ExportCheckRow testid="bld-set-mp-match" label="same size as the artboard" checked={value.jpegMatchArtboard}
      onChange={(v) => onPatch({ jpegMatchArtboard: v })}
      hint="the JPEG is the artboard itself — untick for a bigger file" />
    <ExportNumberRow testid="bld-set-quality" label="JPEG quality" value={value.jpegQuality} min={QUALITY_MIN} max={QUALITY_MAX} step={0.01}
      onChange={(v) => onPatch({ jpegQuality: clampQuality(v) })} hint="0.5 – 1" />
  </>;
}

/** The rows themselves — pure props, so tests and the dialog share one markup. */
export function BuilderFormatSettings({ value, onPatch, onClose }: Props) {
  return (
    <section className="bld-modal" role="dialog" aria-label="Export settings" data-testid="builder-format-dialog">
      <header className="bld-modal-head">
        <h2>Export settings</h2>
        <button type="button" className="svg-btn tiny" data-testid="builder-format-close" onClick={onClose}>Close</button>
      </header>
      <div className="up-set-grid">
        <DeliveryRows value={value} onPatch={onPatch} />
        <JpegRows value={value} onPatch={onPatch} />
        <ExportCheckRow testid="bld-set-optimize" label="Optimize SVG (SVGO)" checked={value.optimizeSvg} onChange={(v) => onPatch({ optimizeSvg: v })}
          hint="the export copy only — viewBox, geometry, strokes and metadata are preserved" />
        <ExportCheckRow testid="bld-set-expand" label="Expand strokes to fills" checked={value.expandStrokes} onChange={(v) => onPatch({ expandStrokes: v })}
          hint="strokes become filled shapes (what some stocks require); the SVG, JPEG and EPS all ship without strokes" />
        <ExportCheckRow testid="bld-set-expandtext" label="Expand text to fills" checked={value.expandText} onChange={(v) => onPatch({ expandText: v })}
          hint="text becomes filled glyph outlines; what cannot be outlined fails that stage honestly" />
        <ExportCheckRow testid="bld-set-rescale" label="Rescale artboard to MP" checked={value.rescaleArtboard} onChange={(v) => onPatch({ rescaleArtboard: v })}
          hint="the full artboard keeps its ratio and grows until its area is the megapixel target" />
        {value.rescaleArtboard && <>
          <ExportNumberRow testid="bld-set-rescale-mp" label="Rescale target (MP)" value={value.rescaleMegapixels} min={MP_MIN} max={MP_MAX} step={1}
            onChange={(v) => onPatch({ rescaleMegapixels: clampRescaleMegapixels(v) })} hint="the artboard area in megapixels (1 – 64)" />
          <ExportCheckRow testid="bld-set-rescale-strokes" label="Scale strokes proportionally" checked={value.rescaleStrokes}
            onChange={(v) => onPatch({ rescaleStrokes: v })}
            hint="untick and every stroke keeps its printed px while the artboard rescales" />
        </>}
      </div>
    </section>
  );
}

export default function SvgBuilderFormatDialog({ b }: { b: BuilderApi }) {
  const [value, setValue] = useState<ExportFormatOptions>(loadBuilderFormats);
  const onPatch = (patch: Partial<ExportFormatOptions>) => {
    const next = { ...value, ...patch };
    setValue(next);
    saveBuilderFormats(next);
  };
  return <BuilderFormatSettings value={value} onPatch={onPatch} onClose={b.actions.closeDialog} />;
}
