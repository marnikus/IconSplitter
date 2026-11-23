// SvgBuilderFormatDialog.tsx — the builder's Export settings dialog
// (2026-11-17): the upload flow's OWN popup (`ui/exportmodal.tsx`: same
// backdrop, card, head, Close/Escape/backdrop dismissal) around the ONE shared
// format sheet (`ui/exportsheet.tsx`) the SVG to upload dialog also renders —
// so "Export settings" in the toolbar opens exactly like "SVG to upload"'s
// settings, not a builder-only look (2026-11-19). Its rows write
// the builder's own persisted options (formatstore) at once (RULE 24); the
// stock package and its EPS stage read exactly these options (sheetpackage.ts).
// A PNG instead of the JPEG (2026-11-23): the same switch, MP and artboard
// match, named PNG, no quality. No row, hint or clamp is written twice.
import { useState } from "react";
import { type ExportFormatOptions } from "../lib/exportformats";
import ExportModal from "../ui/exportmodal";
import { ExportFormatSheet } from "../ui/exportsheet";
import { loadBuilderFormats, saveBuilderFormats } from "./formatstore";
import type { BuilderApi } from "./useSvgBuilder";

export interface BuilderFormatProps {
  value: ExportFormatOptions;
  /** The sheet's own artboard px — what the JPEG note names (after any rescale). */
  artboard: { width: number; height: number };
  onPatch: (patch: Partial<ExportFormatOptions>) => void;
  onClose: () => void;
}

/** The dialog's markup — pure props, so tests and the panel share one tree. */
export function BuilderFormatSettings({ value, artboard, onPatch, onClose }: BuilderFormatProps) {
  return <ExportModal title="Export settings — what the next export writes" titleId="builder-format-title"
    testid="builder-format-dialog" backdropTestid="builder-format-backdrop" closeTestid="builder-format-close"
    backdropClass="bld-export-backdrop" onClose={onClose}>
    <p className="builder-note" data-testid="builder-format-note">
      Every checked artboard (else the open one) is written under <b>_artboard_sheets</b> in the folder: the ticked
      SVG, PNG and EPS beside export.json. Anything a stage cannot write is named and left out.
    </p>
    <EpsTextNote value={value} />
    <div className="up-set-grid">
      <ExportFormatSheet scope="bld-set" value={value} patch={onPatch} artboard={artboard} raster="png" />
    </div>
  </ExportModal>;
}

/**
 * The built-in EPS writer cannot write live text, and a sheet always carries its
 * banner words — said BEFORE the export instead of failing that stage after it
 * (the Inkscape helper outlines the text, and Expand text to fills removes it).
 */
function EpsTextNote({ value }: { value: ExportFormatOptions }) {
  if (!value.includeEps || value.expandText || value.epsConverter !== "builtin") return null;
  return <p className="builder-warning" role="note" data-testid="builder-format-eps-note">
    ⚠ EPS: the built-in writer cannot write live text, so the sheet's banner words would fail that stage.
    Tick <b>Expand text to fills</b> (the words ship as outlines), or choose the Inkscape converter.
  </p>;
}

export default function SvgBuilderFormatDialog({ b }: { b: BuilderApi }) {
  const [value, setValue] = useState<ExportFormatOptions>(loadBuilderFormats);
  const onPatch = (patch: Partial<ExportFormatOptions>) => {
    const next = { ...value, ...patch };
    setValue(next);
    saveBuilderFormats(next);
  };
  const { width, height } = b.config.artboard;
  return <BuilderFormatSettings value={value} artboard={{ width, height }} onPatch={onPatch} onClose={b.actions.closeDialog} />;
}
